const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");
const { charNgrams, normalizeText, tokenize } = require("./utils");
const {
  decodeMemoryArchive,
  encodeMemoryArchive,
  readMemoryArchive,
  writeMemoryArchive,
} = require("./backup");
const { loadLexiconState, saveLexiconState } = require("./concepts");
const { resolveMemoryProfile } = require("./profiles");

function loadBinding() {
  const candidates = [
    path.resolve(__dirname, "..", "build", "Release", "chl_addon.node"),
    path.resolve(__dirname, "..", "build", "Debug", "chl_addon.node"),
  ];
  let lastError = null;
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        return { binding: require(candidate), error: null };
      } catch (error) {
        lastError = error;
      }
    }
  }
  return { binding: null, error: lastError };
}

const bindingState = loadBinding();
const binding = bindingState.binding;

class NativeCHL {
  constructor(options = {}) {
    this.options = resolveMemoryProfile({
      ...options,
      persistPath: options.persistPath ?? null,
      seed: options.seed ?? 0,
    });
    this.persistPath = this._normalizePersistPath(this.options.persistPath);
    this.conceptsPath = this.options.conceptsPath ?? this._deriveSidecarPath(".concepts.tsv");
    this.phrasesPath = this.options.phrasesPath ?? this._deriveSidecarPath(".phrases.tsv");
    this._hydrating = false;
    this._journal = [];
    this._readyError = null;
    this._nativeLoadError = bindingState.error ?? null;
    this.fallback = null;
    this._syncLexiconEnv();
    if (binding) {
      this.engine = new binding.CHLEngine(
        this.options.bitCount,
        this.options.bandBits,
        this.options.hyperDim,
        this.options.maxEntries,
        this.options.maxCandidates,
        this.options.seed,
        this.options.largeProfile ? 1 : 0
      );
    } else {
      const { CHL } = require("./chl");
      this.fallback = new CHL(this.options);
    }
    this._ensurePersistDir();
    this._ready = this._hydrateFromDiskAsync().catch((error) => {
      this._readyError = error;
    });
  }

  _ensurePersistDir() {
    if (!this.persistPath) return;
    fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
  }

  _normalizePersistPath(persistPath) {
    if (!persistPath) return null;
    try {
      if (fs.existsSync(persistPath) && fs.statSync(persistPath).isDirectory()) {
        return path.join(persistPath, "chl-memory.log");
      }
    } catch {
      // fall through and keep provided path
    }
    return persistPath;
  }

  _deriveSidecarPath(suffix) {
    if (!this.persistPath) return null;
    const parsed = path.parse(this.persistPath);
    return path.join(parsed.dir, `${parsed.name}${suffix}`);
  }

  _syncLexiconEnv() {
    if (this.conceptsPath) {
      process.env.CHL_CONCEPTS_PATH = this.conceptsPath;
    }
    if (this.phrasesPath) {
      process.env.CHL_PHRASES_PATH = this.phrasesPath;
    }
  }

  _lexiconState() {
    return loadLexiconState({
      conceptsPath: this.conceptsPath,
      phrasesPath: this.phrasesPath,
    });
  }

  _saveLexiconState(state = this._lexiconState()) {
    return saveLexiconState(state, {
      conceptsPath: this.conceptsPath,
      phrasesPath: this.phrasesPath,
    });
  }

  async _hydrateFromDiskAsync() {
    if (!this.persistPath || !fs.existsSync(this.persistPath)) return;
    this._hydrating = true;
    try {
      const stream = fs.createReadStream(this.persistPath, { encoding: "utf8" });
      const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
      try {
        for await (const line of reader) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          this._journal.push(event);
          if (event.type === "remember") {
            this.remember(event.text, event.payload, event.metadata);
          } else if (event.type === "learn") {
            this.learn(event.text, event.reward);
          }
        }
      } finally {
        reader.close();
        stream.destroy();
      }
    } finally {
      this._hydrating = false;
    }
  }

  whenReady() {
    return this._ready.then(() => {
      if (this._readyError) {
        throw this._readyError;
      }
    });
  }

  _appendEvent(event) {
    this._journal.push(event);
    if (!this.persistPath || this._hydrating) return;
    fs.appendFileSync(this.persistPath, `${JSON.stringify(event)}\n`);
  }

  _replacePersistFile(events) {
    if (!this.persistPath) return;
    const serialized = events.map((event) => JSON.stringify(event)).join("\n");
    fs.writeFileSync(this.persistPath, serialized ? `${serialized}\n` : "");
  }

  _normalize(input) {
    return normalizeText(typeof input === "string" ? input : JSON.stringify(input));
  }

  remember(input, payload = null, metadata = {}) {
    if (this.fallback) {
      const entry = this.fallback.remember(input, payload, metadata);
      this._appendEvent({
        type: "remember",
        text: typeof input === "string" ? input : JSON.stringify(input),
        payload,
        metadata,
      });
      return entry;
    }
    const text = this._normalize(input);
    const payloadJson = JSON.stringify({
      payload,
      metadata,
      sourceText: typeof input === "string" ? input : JSON.stringify(input),
    });
    const quality = metadata.quality ?? 1;
    const entry = JSON.parse(this.engine.remember(text, payloadJson, quality));
    this._appendEvent({
      type: "remember",
      text: typeof input === "string" ? input : JSON.stringify(input),
      payload,
      metadata,
    });
    return entry;
  }

  recall(query, options = {}) {
    if (this.fallback) {
      return this.fallback.recall(query, options);
    }
    const text = this._normalize(query);
    const raw = JSON.parse(this.engine.query(text, options.topK ?? 5));
    return {
      ...raw,
      candidates: raw.candidates.map((candidate) => ({
        ...candidate,
        payload: unwrapCandidatePayload(candidate),
      })),
    };
  }

  infer(query, options = {}) {
    const result = this.recall(query, options);
    const best = result.candidates[0] ?? null;
    const answer = unwrapCandidatePayload(best);
    return {
      answer,
      support: result.candidates.map((candidate) => unwrapCandidatePayload(candidate)),
      confidence: result.confidence ?? 0,
      candidates: result.candidates,
      queryHash: result.queryHash,
    };
  }

  learn(input, reward = 0) {
    if (this.fallback) {
      const result = this.fallback.updateFeedback(input, reward);
      this._appendEvent({
        type: "learn",
        text: typeof input === "string" ? input : JSON.stringify(input),
        reward,
      });
      return result;
    }
    const result = this.engine.learn(this._normalize(input), reward);
    this._appendEvent({
      type: "learn",
      text: typeof input === "string" ? input : JSON.stringify(input),
      reward,
    });
    return result;
  }

  updateFeedback(input, reward = 0) {
    return this.learn(input, reward);
  }

  snapshot() {
    if (this.fallback) {
      return this.fallback.memory.snapshot();
    }
    return JSON.parse(this.engine.snapshot());
  }

  profile() {
    return this.snapshot().profile ?? this.options.profile ?? "default";
  }

  bucketStats() {
    if (this.fallback) {
      const buckets = [];
      for (const map of this.fallback.memory.bandMaps) {
        for (const bucket of map.values()) {
          buckets.push(bucket.size);
        }
      }
      const occupiedBuckets = buckets.length;
      const collisionBuckets = buckets.filter((size) => size > 1).length;
      const totalAssignments = buckets.reduce((sum, size) => sum + size, 0);
      const maxBucketSize = buckets.reduce((max, size) => Math.max(max, size), 0);
      return {
        occupiedBuckets,
        collisionBuckets,
        totalAssignments,
        maxBucketSize,
        avgBucketLoad: occupiedBuckets ? totalAssignments / occupiedBuckets : 0,
      };
    }
    if (typeof this.engine.bucketStats === "function") {
      return JSON.parse(this.engine.bucketStats());
    }
    const snapshot = this.snapshot();
    return {
      occupiedBuckets: snapshot.buckets ?? 0,
      collisionBuckets: snapshot.exactCollisions ?? 0,
      totalAssignments: snapshot.size ?? 0,
      maxBucketSize: 0,
      avgBucketLoad: snapshot.buckets ? (snapshot.size ?? 0) / snapshot.buckets : 0,
    };
  }

  entries() {
    if (this.fallback) {
      return Array.from(this.fallback.memory.entries.values()).map((entry) => ({
        id: entry.id,
        text: entry.text,
        representations:
          entry.representations ?? {
            normalizedText: normalizeText(entry.text),
            canonicalText: normalizeText(entry.text),
            tokens: tokenize(entry.text),
            ngrams3: charNgrams(entry.text, 3),
            ngrams4: charNgrams(entry.text, 4),
            concepts: tokenize(entry.text),
            negated: tokenize(entry.text).some((token) => token === "no" || token === "sin" || token === "nunca" || token === "jamas"),
          },
        payloadRepresentations:
          entry.payloadRepresentations ?? {
            normalizedText: entry.payload == null ? "" : normalizeText(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload)),
            canonicalText: entry.payload == null ? "" : normalizeText(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload)),
            tokens: entry.payload == null ? [] : tokenize(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload)),
            ngrams3: entry.payload == null ? [] : charNgrams(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload), 3),
            ngrams4: entry.payload == null ? [] : charNgrams(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload), 4),
            concepts: entry.payload == null ? [] : tokenize(typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload)),
            negated: false,
          },
        hash: Array.from(entry.hash ?? []).join?.("") ?? "",
        hyper: Array.from(entry.hypervector ?? []).join?.("") ?? "",
        payloadJson: JSON.stringify(entry.payload),
        quality: entry.quality,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        lastAccessAt: entry.lastAccessAt,
        accessCount: entry.accessCount,
        prototypeCount: entry.prototypeCount,
      }));
    }
    if (typeof this.engine.entries === "function") {
      return JSON.parse(this.engine.entries());
    }
    return [];
  }

  dumpState() {
    if (this.fallback) {
      return {
        snapshot: this.fallback.memory.snapshot(),
        bucketStats: this.bucketStats(),
        entries: this.entries(),
        journal: [...this._journal],
      };
    }
    if (typeof this.engine.dumpState === "function") {
      const state = JSON.parse(this.engine.dumpState());
      return {
        ...state,
        journal: [...this._journal],
      };
    }
    return {
      snapshot: this.snapshot(),
      bucketStats: this.bucketStats(),
      entries: this.entries(),
      journal: [...this._journal],
    };
  }

  journal() {
    return [...this._journal];
  }

  confidenceFor(query, options = {}) {
    const result = this.recall(query, options);
    if (result.candidates.length === 0) return 0;
    const best = result.candidates[0].score ?? 0;
    const second = result.candidates[1]?.score ?? 0;
    return Math.max(0, Math.min(1, 0.5 * best + 0.5 * (best - second)));
  }

  buildWorkingState(query, candidates = []) {
    const result = this.recall(query, { topK: candidates.length || 5 });
    const support = candidates.length > 0 ? candidates : result.candidates;
    return {
      queryEncoding: { text: this._normalize(query) },
      state: {
        support,
      },
      supportStrength: this.confidenceFor(query, { topK: support.length || 5 }),
    };
  }

  route(query, relationKey, options = {}) {
    const result = this.recall(query, options);
    const routed = [];
    for (const candidate of result.candidates) {
      const payload = unwrapCandidatePayload(candidate);
      if (payload && typeof payload === "object" && Array.isArray(payload.relations)) {
        for (const relation of payload.relations) {
          if (relation && relation.key === relationKey) {
            routed.push({
              from: candidate.id,
              relation: relationKey,
              to: relation.value,
              score: candidate.score,
            });
          }
        }
      }
    }
    return routed;
  }

  clear() {
    if (this.fallback) {
      this.fallback.memory.entries.clear();
      this._journal = [];
      if (this.persistPath) fs.writeFileSync(this.persistPath, "");
      return;
    }
    this.engine.clear();
    this._journal = [];
    if (this.persistPath) fs.writeFileSync(this.persistPath, "");
  }

  backup() {
    return {
      format: "chl-archive-v1",
      createdAt: new Date().toISOString(),
      options: this.options,
      journal: [...this._journal],
      lexicon: this._lexiconState(),
      state: this.dumpState(),
    };
  }

  backupMemory() {
    return encodeMemoryArchive(this.backup());
  }

  restore(backupInput, options = {}) {
    const backup = this._normalizeBackupInput(backupInput);
    const acceptableFormats = new Set(["chl-archive-v1", "chl-backup-v1"]);
    if (!backup || !acceptableFormats.has(backup.format) || !Array.isArray(backup.journal)) {
      throw new Error("Invalid CHL backup");
    }

    const replace = options.replace ?? true;
    if (replace) {
      this.clear();
    }

    this._hydrating = true;
    try {
      for (const event of backup.journal) {
        if (event && event.type === "remember") {
          this.remember(event.text, event.payload, event.metadata ?? {});
        } else if (event && event.type === "learn") {
          this.learn(event.text, event.reward ?? 0);
        }
      }
    } finally {
      this._hydrating = false;
    }

    this._journal = [...backup.journal];
    this._replacePersistFile(this._journal);
    if (backup.lexicon) {
      this._saveLexiconState(backup.lexicon);
    }
    return {
      ok: true,
      snapshot: this.snapshot(),
      bucketStats: this.bucketStats(),
    };
  }

  restoreMemory(buffer, options = {}) {
    const backup = decodeMemoryArchive(buffer);
    return this.restore(backup, options);
  }

  saveMemory(filePath) {
    writeMemoryArchive(filePath, this.backup());
    return { ok: true, path: filePath };
  }

  loadMemory(filePath, options = {}) {
    const backup = readMemoryArchive(filePath);
    return this.restore(backup, options);
  }

  saveLexicon() {
    return this._saveLexiconState();
  }

  lexicon() {
    return this._lexiconState();
  }

  _normalizeBackupInput(backupInput) {
    if (Buffer.isBuffer(backupInput) || backupInput instanceof Uint8Array) {
      return decodeMemoryArchive(backupInput);
    }
    if (typeof backupInput === "string") {
      const trimmed = backupInput.trim();
      if (trimmed.startsWith("{")) {
        return JSON.parse(trimmed);
      }
      if (fs.existsSync(trimmed)) {
        const binary = fs.readFileSync(trimmed);
        return decodeMemoryArchive(binary);
      }
      return JSON.parse(trimmed);
    }
    return backupInput;
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function unwrapCandidatePayload(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  if (candidate.payload !== undefined) {
    return candidate.payload;
  }
  if (candidate.payloadJson !== undefined) {
    return safeParse(candidate.payloadJson);
  }
  if (candidate.entry && candidate.entry.payload !== undefined) {
    return candidate.entry.payload;
  }
  if (candidate.entry && candidate.entry.payloadJson !== undefined) {
    return safeParse(candidate.entry.payloadJson);
  }
  return null;
}

module.exports = {
  NativeCHL,
  binding,
  loadBinding,
};
