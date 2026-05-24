const { hammingDistance, semanticHashFromText } = require("./simhash");
const { conceptualizeTokens: conceptTokens, getPhraseMap } = require("./concepts");
const { analyzeText } = require("./analysis");
const {
  bindVectors,
  bundleVectors,
  cloneVector,
  prototypeVectorFromText,
  similarity,
  vectorFromSeed,
} = require("./hypervector");
const { clamp, charNgrams, normalizeText, tokenize, wordsToHex } = require("./utils");
const crypto = require("crypto");

function makeBandKey(words, bandIndex, wordsPerBand) {
  const start = bandIndex * wordsPerBand;
  const slice = words.slice(start, start + wordsPerBand);
  return wordsToHex(slice);
}

function createBands(bitCount, bandBits = 32) {
  if (bitCount % bandBits !== 0) {
    throw new Error(`bitCount ${bitCount} must be divisible by bandBits ${bandBits}`);
  }
  const bands = bitCount / bandBits;
  const wordsPerBand = bandBits / 32;
  return { bands, wordsPerBand };
}

const PHRASE_CANONICALS = [
  ["da luz a", "ilumina"],
  ["desprende humo", "humea"],
  ["se mueve por", "corre por"],
  ["se desplaza en", "nada en"],
  ["se posa en", "posa en"],
  ["arriba a", "llega a"],
  ["llega a", "entra en"],
  ["desbloquea", "abre"],
  ["conserva", "guarda"],
  ["recarga", "carga"],
  ["permanece en", "esta en"],
  ["sigue en", "esta en"],
  ["tapiza", "cubre"],
  ["resuena", "suena"],
  ["anota", "escribe"],
  ["adquiere", "compra"],
  ["moja", "riega"],
  ["templa", "calienta"],
  ["enseña", "muestra"],
  ["vigila", "observa"],
  ["examina", "analiza"],
  ["coordina con", "sincroniza con"],
  ["maneja", "procesa"],
  ["localiza", "encuentra"],
  ["sigue", "rastrea"],
  ["resguarda", "protege"],
  ["enciende", "activa"],
  ["apaga", "desactiva"],
  ["obtiene", "recibe"],
  ["favorece", "prioriza"],
  ["absorbe", "aprende"],
];

function normalizedTokens(text) {
  return tokenize(text);
}

function canonicalizeText(text) {
  let canonical = normalizeText(text);
  for (const [from, to] of PHRASE_CANONICALS) {
    const pattern = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    canonical = canonical.replace(pattern, to);
  }
  const learnedPhraseMap = getPhraseMap();
  for (const [from, to] of learnedPhraseMap.entries()) {
    const pattern = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    canonical = canonical.replace(pattern, to);
  }
  return canonical;
}

function conceptualizeTokens(text) {
  return conceptTokens(text);
}

function setJaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const item of setA) {
    if (setB.has(item)) inter += 1;
  }
  const union = new Set([...setA, ...setB]).size;
  return union ? inter / union : 0;
}

function buildRepresentations(text) {
  return analyzeText(text, {
    canonicalizeText,
    conceptualizeTokens,
  });
}

function stringifyPayload(payload) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

function representationSimilarity(queryReps, entryReps) {
  const tokenScore = setJaccard(queryReps.tokens, entryReps.tokens);
  const sequenceScore = tokenSequenceSimilarity(queryReps.focusTokens, entryReps.focusTokens);
  const ngram3Score = setJaccard(queryReps.ngrams3, entryReps.ngrams3);
  const ngram4Score = setJaccard(queryReps.ngrams4, entryReps.ngrams4);
  const lexical = 0.22 * tokenScore + 0.18 * sequenceScore + 0.30 * ngram3Score + 0.30 * ngram4Score;
  const concept = setJaccard(queryReps.concepts, entryReps.concepts);
  return { lexical, concept, negationMatch: queryReps.negated === entryReps.negated ? 1 : 0, sequenceScore };
}

function tokenSequenceSimilarity(a, b) {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length === 0 || right.length === 0) return 0;
  const dp = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      dp[i][j] = left[i - 1] === right[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[left.length][right.length] / Math.max(left.length, right.length);
}

class AssociativeMemory {
  constructor(options = {}) {
    this.bitCount = options.bitCount ?? 128;
    this.bandBits = options.bandBits ?? 32;
    this.hyperDim = options.hyperDim ?? 256;
    this.maxEntries = options.maxEntries ?? 4096;
    this.maxCandidates = options.maxCandidates ?? 64;
    this.profile = options.profile ?? "default";
    this.largeProfile = options.largeProfile ?? this.profile === "large";
    this.minMergeSimilarity = options.minMergeSimilarity ?? 0.9;
    this.seed = options.seed ?? 0;
    this.recentHalfLifeMs = options.recentHalfLifeMs ?? 30 * 60 * 1000;
    this.bitBias = new Float64Array(this.bitCount);
    this.entries = new Map();
    this.bandMaps = [];
    this.textMap = new Map();
    this.canonicalTextMap = new Map();
    this.tokenMaps = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];
    this.payloadTokenMaps = [new Map(), new Map(), new Map(), new Map(), new Map(), new Map()];
    const { bands, wordsPerBand } = createBands(this.bitCount, this.bandBits);
    this.bandCount = bands;
    this.wordsPerBand = wordsPerBand;
    for (let i = 0; i < this.bandCount; i += 1) {
      this.bandMaps.push(new Map());
    }
  }

  encodeText(text) {
    return semanticHashFromText(text, {
      bitCount: this.bitCount,
      seed: this.seed,
      bitBias: this.bitBias,
    });
  }

  makeEntry(input, payload = null, metadata = {}) {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    const representations = buildRepresentations(text);
    const payloadText = stringifyPayload(payload);
    const payloadRepresentations = payloadText ? buildRepresentations(payloadText) : null;
    const hash = this.encodeText(text);
    const hypervector = prototypeVectorFromText(text, this.hyperDim, this.seed);
    const now = Date.now();
    return {
      id: metadata.id || crypto.randomUUID(),
      text,
      representations,
      payloadRepresentations,
      hash,
      hypervector,
      payload: payload ?? input,
      metadata: { ...metadata },
      quality: metadata.quality ?? 1,
      createdAt: now,
      updatedAt: now,
      lastAccessAt: now,
      accessCount: 0,
      prototypeCount: 1,
    };
  }

  indexEntry(entry) {
    this._indexText(this.textMap, entry.representations?.normalizedText ?? "", entry.id);
    this._indexText(this.canonicalTextMap, entry.representations?.canonicalText ?? "", entry.id);
    this._indexText(this.textMap, entry.payloadRepresentations?.normalizedText ?? "", entry.id);
    this._indexText(this.canonicalTextMap, entry.payloadRepresentations?.canonicalText ?? "", entry.id);
    for (let bandIndex = 0; bandIndex < this.bandCount; bandIndex += 1) {
      const key = makeBandKey(entry.hash, bandIndex, this.wordsPerBand);
      let bucket = this.bandMaps[bandIndex].get(key);
      if (!bucket) {
        bucket = new Set();
        this.bandMaps[bandIndex].set(key, bucket);
      }
      bucket.add(entry.id);
    }
    this._indexTerms(this.tokenMaps[0], entry.representations?.tokens ?? [], entry.id);
    this._indexTerms(this.tokenMaps[1], entry.representations?.ngrams3 ?? [], entry.id);
    this._indexTerms(this.tokenMaps[2], entry.representations?.ngrams4 ?? [], entry.id);
    this._indexTerms(this.tokenMaps[3], entry.representations?.concepts ?? [], entry.id);
    this._indexTerms(this.tokenMaps[4], entry.representations?.focusTokens ?? [], entry.id);
    this._indexTerms(this.tokenMaps[5], entry.representations?.tokenBigrams ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[0], entry.payloadRepresentations?.tokens ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[1], entry.payloadRepresentations?.ngrams3 ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[2], entry.payloadRepresentations?.ngrams4 ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[3], entry.payloadRepresentations?.concepts ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[4], entry.payloadRepresentations?.focusTokens ?? [], entry.id);
    this._indexTerms(this.payloadTokenMaps[5], entry.payloadRepresentations?.tokenBigrams ?? [], entry.id);
  }

  unindexEntry(entry) {
    this._unindexText(this.textMap, entry.representations?.normalizedText ?? "", entry.id);
    this._unindexText(this.canonicalTextMap, entry.representations?.canonicalText ?? "", entry.id);
    this._unindexText(this.textMap, entry.payloadRepresentations?.normalizedText ?? "", entry.id);
    this._unindexText(this.canonicalTextMap, entry.payloadRepresentations?.canonicalText ?? "", entry.id);
    for (let bandIndex = 0; bandIndex < this.bandCount; bandIndex += 1) {
      const key = makeBandKey(entry.hash, bandIndex, this.wordsPerBand);
      const bucket = this.bandMaps[bandIndex].get(key);
      if (!bucket) continue;
      bucket.delete(entry.id);
      if (bucket.size === 0) this.bandMaps[bandIndex].delete(key);
    }
    this._unindexTerms(this.tokenMaps[0], entry.representations?.tokens ?? [], entry.id);
    this._unindexTerms(this.tokenMaps[1], entry.representations?.ngrams3 ?? [], entry.id);
    this._unindexTerms(this.tokenMaps[2], entry.representations?.ngrams4 ?? [], entry.id);
    this._unindexTerms(this.tokenMaps[3], entry.representations?.concepts ?? [], entry.id);
    this._unindexTerms(this.tokenMaps[4], entry.representations?.focusTokens ?? [], entry.id);
    this._unindexTerms(this.tokenMaps[5], entry.representations?.tokenBigrams ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[0], entry.payloadRepresentations?.tokens ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[1], entry.payloadRepresentations?.ngrams3 ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[2], entry.payloadRepresentations?.ngrams4 ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[3], entry.payloadRepresentations?.concepts ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[4], entry.payloadRepresentations?.focusTokens ?? [], entry.id);
    this._unindexTerms(this.payloadTokenMaps[5], entry.payloadRepresentations?.tokenBigrams ?? [], entry.id);
  }

  _indexText(map, text, id) {
    if (!text) return;
    let bucket = map.get(text);
    if (!bucket) {
      bucket = new Set();
      map.set(text, bucket);
    }
    bucket.add(id);
  }

  _unindexText(map, text, id) {
    if (!text) return;
    const bucket = map.get(text);
    if (!bucket) return;
    bucket.delete(id);
    if (bucket.size === 0) map.delete(text);
  }

  _indexTerms(map, terms, id) {
    for (const term of terms) {
      if (!term) continue;
      let bucket = map.get(term);
      if (!bucket) {
        bucket = new Set();
        map.set(term, bucket);
      }
      bucket.add(id);
    }
  }

  _unindexTerms(map, terms, id) {
    for (const term of terms) {
      if (!term) continue;
      const bucket = map.get(term);
      if (!bucket) continue;
      bucket.delete(id);
      if (bucket.size === 0) map.delete(term);
    }
  }

  insert(input, payload = null, metadata = {}) {
    const entry = this.makeEntry(input, payload, metadata);
    const candidates = this._candidateEntries(entry.representations, entry.hash);
    const merged = candidates.find((candidate) => {
      const sim = 1 - hammingDistance(candidate.hash, entry.hash) / this.bitCount;
      return sim >= this.minMergeSimilarity;
    });

    if (merged) {
      this.unindexEntry(merged);
      merged.hash = cloneVector(bundleVectors([merged.hash, entry.hash], this.bitCount));
      merged.hypervector = cloneVector(bundleVectors([merged.hypervector, entry.hypervector], this.hyperDim));
      merged.representations = this._mergeRepresentations(merged.representations, entry.representations);
      merged.payloadRepresentations = this._mergePayloadRepresentations(
        merged.payloadRepresentations,
        entry.payloadRepresentations
      );
      merged.payload = this._mergePayloads(merged.payload, entry.payload);
      merged.quality = clamp((merged.quality + entry.quality) / 2, 0, 10);
      merged.updatedAt = Date.now();
      merged.prototypeCount += 1;
      this.indexEntry(merged);
      this.entries.set(merged.id, merged);
      return merged;
    }

    this.entries.set(entry.id, entry);
    this.indexEntry(entry);
    this._enforceCapacity();
    return entry;
  }

  _mergePayloads(previous, next) {
    if (previous == null) return next;
    if (next == null) return previous;
    if (Array.isArray(previous) && Array.isArray(next)) return previous.concat(next);
    if (typeof previous === "object" && typeof next === "object") {
      return { ...previous, ...next };
    }
    if (previous === next) return previous;
    return [previous, next];
  }

  _mergeRepresentations(previous, next) {
    if (!previous) return next;
    if (!next) return previous;
    const mergeUnique = (a = [], b = []) => Array.from(new Set([...(a ?? []), ...(b ?? [])]));
    return {
      normalizedText: previous.normalizedText ?? next.normalizedText ?? "",
      canonicalText: previous.canonicalText ?? next.canonicalText ?? "",
      tokens: mergeUnique(previous.tokens, next.tokens),
      ngrams3: mergeUnique(previous.ngrams3, next.ngrams3),
      ngrams4: mergeUnique(previous.ngrams4, next.ngrams4),
      concepts: mergeUnique(previous.concepts, next.concepts),
      negated: Boolean(previous.negated || next.negated),
    };
  }

  _mergePayloadRepresentations(previous, next) {
    if (!previous) return next;
    if (!next) return previous;
    const mergeUnique = (a = [], b = []) => Array.from(new Set([...(a ?? []), ...(b ?? [])]));
    return {
      normalizedText: previous.normalizedText ?? next.normalizedText ?? "",
      canonicalText: previous.canonicalText ?? next.canonicalText ?? "",
      tokens: mergeUnique(previous.tokens, next.tokens),
      ngrams3: mergeUnique(previous.ngrams3, next.ngrams3),
      ngrams4: mergeUnique(previous.ngrams4, next.ngrams4),
      concepts: mergeUnique(previous.concepts, next.concepts),
      negated: Boolean(previous.negated || next.negated),
    };
  }

  _candidateEntries(queryReps, queryHash) {
    const ids = new Set();
    for (let bandIndex = 0; bandIndex < this.bandCount; bandIndex += 1) {
      const key = makeBandKey(queryHash, bandIndex, this.wordsPerBand);
      const bucket = this.bandMaps[bandIndex].get(key);
      if (!bucket) continue;
      for (const id of bucket) ids.add(id);
    }
    this._collectTextCandidates(ids, this.textMap, queryReps.normalizedText);
    this._collectTextCandidates(ids, this.canonicalTextMap, queryReps.canonicalText);
    this._collectTermCandidates(ids, this.tokenMaps[3], queryReps.concepts, 12);
    this._collectTermCandidates(ids, this.tokenMaps[4], queryReps.focusTokens, 12);
    if (ids.size === 0) {
      for (const id of this.entries.keys()) {
        ids.add(id);
        if (ids.size >= this.maxCandidates) break;
      }
    }
    return Array.from(ids, (id) => this.entries.get(id)).filter(Boolean);
  }

  _collectTermCandidates(ids, map, terms, limit) {
    let seenTerms = 0;
    for (const term of terms) {
      if (seenTerms >= limit) break;
      seenTerms += 1;
      const bucket = map.get(term);
      if (!bucket) continue;
      for (const id of bucket) ids.add(id);
    }
  }

  _collectTextCandidates(ids, map, text) {
    const bucket = map.get(text);
    if (!bucket) return;
    for (const id of bucket) ids.add(id);
  }

  _scoreCandidate(queryReps, queryHash, queryHypervector, entry) {
    const hashSim = 1 - hammingDistance(queryHash, entry.hash) / this.bitCount;
    const hvSim = similarity(queryHypervector, entry.hypervector);
    const entryReps = entry.representations ?? buildRepresentations(entry.text ?? "");
    const { concept, negationMatch } = representationSimilarity(queryReps, entryReps);
    const ageMs = Math.max(0, Date.now() - entry.lastAccessAt);
    const recency = Math.exp(-ageMs / this.recentHalfLifeMs);
    const quality = clamp(entry.quality / 10, 0, 1);
    return 0.34 * hashSim + 0.30 * hvSim + 0.22 * concept + 0.10 * recency + 0.04 * quality + 0.02 * negationMatch;
  }

  query(input, options = {}) {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    const queryReps = buildRepresentations(text);
    const queryHash = this.encodeText(text);
    const queryHypervector = prototypeVectorFromText(text, this.hyperDim, this.seed);
    const candidates = this._candidateEntries(queryReps, queryHash);
    const scored = candidates
      .map((entry) => ({
        entry,
        hashDistance: hammingDistance(queryHash, entry.hash),
        score: this._scoreCandidate(queryReps, queryHash, queryHypervector, entry),
      }))
      .sort((a, b) => b.score - a.score);

    scored.splice(options.topK ?? 5);

    if (scored[0]) {
      scored[0].entry.lastAccessAt = Date.now();
      scored[0].entry.accessCount += 1;
    }

    return {
      queryHash,
      queryHypervector,
      candidates: scored,
      confidence: this._confidence(scored),
    };
  }

  _confidence(scored) {
    if (scored.length === 0) return 0;
    if (scored.length === 1) return clamp(scored[0].score, 0, 1);
    const margin = scored[0].score - scored[1].score;
    return clamp(0.5 * scored[0].score + 0.5 * margin, 0, 1);
  }

  learnFromFeedback(input, reward = 0) {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    const signature = this.encodeText(text);
    const rate = reward >= 0 ? 0.05 : 0.03;
    for (let i = 0; i < this.bitCount; i += 1) {
      const bit = (signature[i >>> 5] >>> (i & 31)) & 1;
      this.bitBias[i] += rate * reward * (bit ? 1 : -1);
      this.bitBias[i] = clamp(this.bitBias[i], -4, 4);
    }
  }

  updateEntry(id, patch = {}) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.unindexEntry(entry);
    if (patch.payload !== undefined) entry.payload = patch.payload;
    if (patch.metadata) entry.metadata = { ...entry.metadata, ...patch.metadata };
    if (patch.quality !== undefined) entry.quality = clamp(patch.quality, 0, 10);
    if (patch.hash) entry.hash = patch.hash;
    if (patch.hypervector) entry.hypervector = patch.hypervector;
    if (patch.payload !== undefined) {
      const payloadText = stringifyPayload(entry.payload);
      entry.payloadRepresentations = payloadText ? buildRepresentations(payloadText) : null;
    }
    entry.updatedAt = Date.now();
    this.indexEntry(entry);
    return entry;
  }

  _enforceCapacity() {
    if (this.entries.size <= this.maxEntries) return;
    const entries = Array.from(this.entries.values()).sort((a, b) => {
      const ageScore = (Date.now() - b.lastAccessAt) - (Date.now() - a.lastAccessAt);
      const qualityScore = a.quality - b.quality;
      return ageScore + qualityScore;
    });
    while (entries.length > this.maxEntries) {
      const victim = entries.pop();
      if (!victim) break;
      this.unindexEntry(victim);
      this.entries.delete(victim.id);
    }
  }

  snapshot() {
    return {
      bitCount: this.bitCount,
      bandBits: this.bandBits,
      hyperDim: this.hyperDim,
      profile: this.profile,
      size: this.entries.size,
    };
  }

  clear() {
    this.entries.clear();
    this.bandMaps.forEach((map) => map.clear());
    this.textMap.clear();
    this.canonicalTextMap.clear();
    this.tokenMaps.forEach((map) => map.clear());
    this.payloadTokenMaps.forEach((map) => map.clear());
  }
}

module.exports = {
  AssociativeMemory,
  bindVectors,
  bundleVectors,
  cloneVector,
  prototypeVectorFromText,
  vectorFromSeed,
};
