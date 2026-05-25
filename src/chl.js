const { AssociativeMemory } = require("./memory");
const { analyzeText } = require("./analysis");
const { buildConceptGraph } = require("./graph");
const { buildConsolidation } = require("./consolidation");
const {
  buildAnswer,
  buildDecisionEpisode,
  buildHypotheses,
  buildPlan,
  explainThought,
  learnFromVerification,
  verifyPlan,
} = require("./thought");
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
    const memOpts = {
      ...options,
      seed: options.seed ?? 0,
      lexiconTrainer: options.lexiconTrainer ?? null,
      attention: options.attention ?? null,
    };
    this.options = resolveMemoryProfile(memOpts);
    this.memory = new AssociativeMemory(this.options);
    this._lexiconTrainer = options.lexiconTrainer ?? null;
    this._attention = options.attention ?? null;
    this._decisionEpisodes = [];
    this._lastConsolidatedEpisodeIndex = 0;
    this.autoConsolidationEvery = Math.max(0, Math.floor(Number(this.options.autoConsolidationEvery ?? 0) || 0));
    this.autoConsolidationMinConfidence = clamp(Number(this.options.autoConsolidationMinConfidence ?? 0.65) || 0, 0, 1);
    this.autoConsolidationMinSupport = Math.max(1, Math.floor(Number(this.options.autoConsolidationMinSupport ?? 2) || 2));
    this._autoConsolidationPending = false;
    this._autoConsolidationStats = {
      scheduled: 0,
      completed: 0,
      skipped: 0,
      lastRunAt: null,
      lastError: null,
      lastReason: null,
    };
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

  rememberBatch(batch = []) {
    return this.memory.insertBatch(batch);
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

  analyze(input) {
    return analyzeText(input, {
      canonicalizeText: (text) => text,
    });
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

  conceptGraph() {
    return buildConceptGraph(Array.from(this.memory.entries.values()));
  }

  think(query, options = {}) {
    return buildHypotheses(query, this, options);
  }

  plan(query, options = {}) {
    return buildPlan(query, this, options);
  }

  verify(planOrQuery, options = {}) {
    return verifyPlan(planOrQuery, this, options);
  }

  ask(query, options = {}) {
    const decision = buildAnswer(query, this, options);
    const episode = this.recordDecisionEpisode(decision);
    return {
      ...decision,
      episodeId: episode.id,
    };
  }

  learnFromVerification(verification, options = {}) {
    return learnFromVerification(this.memory, verification, options);
  }

  consolidateEpisodes(options = {}) {
    const startIndex = options.startIndex ?? this._lastConsolidatedEpisodeIndex ?? 0;
    const minConfidence = options.minConfidence ?? null;
    const episodes = this._decisionEpisodes
      .slice(startIndex)
      .filter((episode) => minConfidence == null || Number(episode?.confidence ?? 0) >= minConfidence);
    const consolidation = buildConsolidation(episodes, options);
    for (const rule of consolidation.rules) {
      this.memory.insert(rule.text, rule.payload, rule.metadata);
    }
    this._lastConsolidatedEpisodeIndex = this._decisionEpisodes.length;
    return {
      ok: true,
      ...consolidation.summary,
      rules: consolidation.rules,
      conceptPairs: consolidation.conceptPairs,
      phrasePairs: consolidation.phrasePairs,
      nextEpisodeIndex: this._lastConsolidatedEpisodeIndex,
    };
  }

  consolidationState() {
    return {
      lastEpisodeIndex: this._lastConsolidatedEpisodeIndex ?? 0,
      episodeCount: this._decisionEpisodes.length,
      auto: this.autoConsolidationState(),
    };
  }

  autoConsolidationState() {
    return {
      every: this.autoConsolidationEvery,
      minConfidence: this.autoConsolidationMinConfidence,
      minSupport: this.autoConsolidationMinSupport,
      pending: this._autoConsolidationPending,
      ...this._autoConsolidationStats,
    };
  }

  _maybeScheduleAutoConsolidation(episode) {
    if (this.autoConsolidationEvery <= 0) return;
    if (!episode || Number(episode.confidence ?? 0) < this.autoConsolidationMinConfidence) {
      this._autoConsolidationStats.skipped += 1;
      this._autoConsolidationStats.lastReason = "confidence_below_threshold";
      return;
    }
    const pendingEpisodes = this._decisionEpisodes.length - (this._lastConsolidatedEpisodeIndex ?? 0);
    if (pendingEpisodes < this.autoConsolidationEvery) return;
    if (this._autoConsolidationPending) return;

    this._autoConsolidationPending = true;
    this._autoConsolidationStats.scheduled += 1;
    this._autoConsolidationStats.lastReason = "episode_threshold_reached";
    const run = () => {
      try {
        const result = this.consolidateEpisodes({
          minSupport: this.autoConsolidationMinSupport,
        });
        this._autoConsolidationStats.completed += 1;
        this._autoConsolidationStats.lastRunAt = new Date().toISOString();
        return result;
      } catch (error) {
        this._autoConsolidationStats.lastError = error.message;
        throw error;
      } finally {
        this._autoConsolidationPending = false;
      }
    };

    if (typeof setImmediate === "function") {
      setImmediate(run);
    } else {
      setTimeout(run, 0);
    }
  }

  recordDecisionEpisode(decision, extras = {}) {
    const episode = buildDecisionEpisode(decision, extras);
    this._decisionEpisodes.push(episode);
    this._maybeScheduleAutoConsolidation(episode);
    return episode;
  }

  decisionEpisodes() {
    return [...this._decisionEpisodes];
  }

  explainThought(query, options = {}) {
    return explainThought(this.think(query, options));
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
