const { AssociativeMemory } = require("./memory");
const { resolveMemoryProfile } = require("./profiles");
const {
  bindVectors,
  bundleVectors,
  prototypeVectorFromText,
  similarity,
  vectorFromSeed,
} = require("./hypervector");
const { semanticHashFromText, hammingDistance } = require("./simhash");
const { clamp } = require("./utils");

class CHL {
  constructor(options = {}) {
    this.options = resolveMemoryProfile({
      ...options,
      seed: options.seed ?? 0,
    });
    this.memory = new AssociativeMemory(this.options);
  }

  encode(input) {
    const text = typeof input === "string" ? input : JSON.stringify(input);
    const signature = semanticHashFromText(text, {
      bitCount: this.options.bitCount,
      seed: this.options.seed,
      bitBias: this.memory.bitBias,
    });
    const hypervector = prototypeVectorFromText(text, this.options.hyperDim, this.options.seed);
    return { text, signature, hypervector };
  }

  remember(input, payload = null, metadata = {}) {
    return this.memory.insert(input, payload, metadata);
  }

  recall(query, options = {}) {
    return this.memory.query(query, options);
  }

  infer(query, options = {}) {
    const result = this.recall(query, options);
    const best = result.candidates[0] ?? null;
    const answer = best ? best.entry.payload : null;
    const support = result.candidates.map((item) => item.entry.payload);
    return {
      answer,
      support,
      confidence: result.confidence,
      candidates: result.candidates,
      queryHash: result.queryHash,
    };
  }

  updateFeedback(input, reward = 0) {
    this.memory.learnFromFeedback(input, reward);
  }

  profile() {
    return this.options.profile ?? "default";
  }

  buildWorkingState(query, candidates) {
    const queryEncoding = this.encode(query);
    const vectors = [queryEncoding.hypervector, ...candidates.map((c) => c.entry.hypervector)];
    const state = bundleVectors(vectors, this.options.hyperDim);
    return {
      queryEncoding,
      state,
      supportStrength: candidates.length > 0 ? similarity(queryEncoding.hypervector, state) : 0,
    };
  }

  route(query, relationKey, options = {}) {
    const result = this.recall(query, options);
    const routed = [];
    for (const candidate of result.candidates) {
      const payload = candidate.entry.payload;
      if (payload && typeof payload === "object" && Array.isArray(payload.relations)) {
        for (const relation of payload.relations) {
          if (relation && relation.key === relationKey) {
            routed.push({
              from: candidate.entry.id,
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

  confidenceFor(query, options = {}) {
    const result = this.recall(query, options);
    if (result.candidates.length === 0) return 0;
    const best = result.candidates[0].score;
    const second = result.candidates[1]?.score ?? 0;
    return clamp(0.5 * best + 0.5 * (best - second), 0, 1);
  }
}

module.exports = {
  CHL,
  bindVectors,
  bundleVectors,
  hammingDistance,
  similarity,
  vectorFromSeed,
};
