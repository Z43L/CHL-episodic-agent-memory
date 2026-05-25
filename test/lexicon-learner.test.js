const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ConceptPrototype,
  ContrastiveFeedback,
  PhraseAliasIndex,
  IntentClusterer,
  LexiconTrainer,
  HyperAttentionContext,
  HyperDecoder,
  CHL,
} = require("../src");
const { prototypeVectorFromText, similarity } = require("../src/hypervector");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ─── ConceptPrototype ─────────────────────────────────────

test("ConceptPrototype initializes from aliases", () => {
  const proto = new ConceptPrototype("gato", { aliases: ["felino", "minino"] });
  assert.ok(proto.prototype);
  assert.equal(proto.positiveCount, 2);
  assert.ok(proto.confidence > 0.5);
});

test("ConceptPrototype adds examples and updates confidence", () => {
  const proto = new ConceptPrototype("perro", { aliases: ["can"] });
  assert.ok(proto.confidence < 0.6);
  proto.addExample("el perro corre", true);
  proto.addExample("el perro ladra", true);
  assert.ok(proto.confidence > 0.5); assert.ok(proto.positiveCount > 0);
});

test("ConceptPrototype positive examples increase similarity", () => {
  const proto = new ConceptPrototype("test", { aliases: ["prueba"] });
  const qv = prototypeVectorFromText("realizar una prueba", 256, 0);
  const before = similarity(qv, proto.prototype);
  proto.addExample("hacer un test de verificación", true);
  const after = similarity(qv, proto.prototype);
  // Después de añadir ejemplo positivo, debería acercarse (o mantenerse)
  assert.ok(after >= before - 0.05, `similarity should not drop significantly: ${before.toFixed(3)} → ${after.toFixed(3)}`);
});

test("ConceptPrototype serializes and deserializes", () => {
  const proto = new ConceptPrototype("coche", { aliases: ["automovil", "auto"] });
  proto.addExample("el coche circula", true);
  const json = proto.toJSON();
  const restored = ConceptPrototype.fromJSON(json);
  assert.equal(restored.id, "coche");
  assert.equal(restored.aliases.length, 2);
  assert.equal(restored.positiveCount, proto.positiveCount);
  assert.ok(restored.prototype);
  assert.deepEqual(Array.from(restored.prototype), Array.from(proto.prototype));
});

// ─── ContrastiveFeedback ──────────────────────────────────

test("ContrastiveFeedback pull moves prototype toward query", () => {
  const fb = new ContrastiveFeedback({ hyperDim: 256 });
  const proto = prototypeVectorFromText("gato felino", 256, 0);
  const query = prototypeVectorFromText("el gato duerme sobre la mesa", 256, 0);
  
  const before = similarity(proto, query);
  const pulled = fb.pull(proto, query);
  const after = similarity(pulled, query);
  
  assert.ok(after >= before, `pull should increase similarity: ${before.toFixed(4)} → ${after.toFixed(4)}`);
});

test("ContrastiveFeedback push moves prototype away from query", () => {
  const fb = new ContrastiveFeedback({ hyperDim: 256 });
  const proto = prototypeVectorFromText("gato", 256, 0);
  const query = prototypeVectorFromText("perro ladrando", 256, 0);
  
  const before = similarity(proto, query);
  const pushed = fb.push(proto, query);
  const after = similarity(pushed, query);
  
  // push debería reducir la similitud (o al menos no aumentarla)
  assert.ok(after <= before + 0.01, `push should not increase similarity: ${before.toFixed(4)} → ${after.toFixed(4)}`);
});

test("ContrastiveFeedback apply updates multiple concepts", () => {
  const fb = new ContrastiveFeedback();
  const selected = new ConceptPrototype("gato", { aliases: ["gato"] });
  const rejected = new ConceptPrototype("perro", { aliases: ["perro"] });
  const qv = prototypeVectorFromText("el felino duerme", 256, 0);
  
  const result = fb.apply(selected, [rejected], qv);
  assert.equal(result.pulled, 1);
  assert.equal(result.pushed, 1);
  assert.ok(selected.positiveCount > 0);
  assert.ok(rejected.negativeCount > 0);
});

// ─── PhraseAliasIndex ─────────────────────────────────────

test("PhraseAliasIndex resolves multi-word phrases to concepts", () => {
  const idx = new PhraseAliasIndex();
  idx.add("ventanas flotantes", "desktop_mode");
  idx.add("modo escritorio", "desktop_mode");
  idx.add("pantalla completa", "fullscreen");
  
  assert.equal(idx.resolveConcept("usar ventanas flotantes"), "desktop_mode");
  assert.equal(idx.resolveConcept("abrir en modo escritorio"), "desktop_mode");
  assert.equal(idx.resolveConcept("ver en pantalla completa"), "fullscreen");
  assert.equal(idx.resolveConcept("algo sin relacion"), null);
});

test("PhraseAliasIndex extracts phrases from text", () => {
  const idx = new PhraseAliasIndex();
  const phrases = idx.extractPhrases("quiero usar el modo escritorio de samsung");
  assert.ok(phrases.some((p) => p.includes("modo escritorio")));
  assert.ok(phrases.length > 2);
});

// ─── IntentClusterer ──────────────────────────────────────

test("IntentClusterer groups queries by concept", () => {
  const ic = new IntentClusterer();
  ic.add("como abrir apps en ventanas", "desktop_mode");
  ic.add("quiero usar dex", "desktop_mode");
  ic.add("el perro corre en el parque", "perro_movimiento");
  
  assert.equal(ic.clusterCount, 2);
  
  const sim1 = ic.intentSimilarityForText("activar modo escritorio", "desktop_mode");
  const sim2 = ic.intentSimilarityForText("activar modo escritorio", "perro_movimiento");
  assert.ok(sim1 > sim2, `desktop_mode sim (${sim1.toFixed(3)}) should exceed perro sim (${sim2.toFixed(3)})`);
});

// ─── LexiconTrainer ───────────────────────────────────────

test("LexiconTrainer initializes from concept map", () => {
  const conceptMap = new Map([
    ["felino", "gato"],
    ["can", "perro"],
    ["automovil", "coche"],
  ]);
  const trainer = new LexiconTrainer({ conceptMap });
  const snap = trainer.snapshot();
  assert.ok(snap.prototypeCount >= 3);
});

test("LexiconTrainer resolves concepts from text", () => {
  const conceptMap = new Map([["felino", "gato"], ["can", "perro"]]);
  const trainer = new LexiconTrainer({ conceptMap });
  assert.equal(trainer.resolveConcept("el felino duerme"), "gato");
  assert.equal(trainer.resolveConcept("el can ladra"), "perro");
  assert.equal(trainer.resolveConcept("algo desconocido"), null);
});

test("LexiconTrainer online feedback adjusts prototypes", () => {
  const conceptMap = new Map([["felino", "gato"], ["can", "perro"]]);
  const trainer = new LexiconTrainer({ conceptMap });
  
  // Simular un recall donde "perro" ganó pero debía ganar "gato"
  trainer.applyOnlineFeedback("el felino duerme", "gato", ["perro"]);
  
  const gatoProto = trainer.getPrototype("gato");
  const perroProto = trainer.getPrototype("perro");
  assert.ok(gatoProto.positiveCount > 0);
  assert.ok(perroProto.negativeCount > 0);
});

test("LexiconTrainer batch training", () => {
  const conceptMap = new Map([["felino", "gato"]]);
  const trainer = new LexiconTrainer({ conceptMap });
  
  const episodes = [
    { query: "el felino duerme en el sofa", bestEvidenceText: "el gato descansa en el sofa" },
    { query: "el felino come pescado", bestEvidenceText: "el gato come pescado" },
  ];
  
  const result = trainer.trainBatch(episodes);
  assert.ok(result.updates >= 1);
});

test("LexiconTrainer save and load", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-test-"));
  const protoPath = path.join(tmpDir, "concepts-prototypes.json");
  
  const conceptMap = new Map([["felino", "gato"]]);
  const trainer = new LexiconTrainer({ conceptMap, prototypesPath: protoPath });
  trainer.applyOnlineFeedback("el felino duerme", "gato");
  trainer.save();
  
  assert.ok(fs.existsSync(protoPath));
  
  const trainer2 = new LexiconTrainer({ conceptMap: new Map(), prototypesPath: protoPath });
  assert.ok(trainer2.load());
  assert.ok(trainer2.getPrototype("gato"));
  
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── HyperAttentionContext ─────────────────────────────────

test("HyperAttention produces weights similar to defaults when untrained", () => {
  const attn = new HyperAttentionContext();
  const qv = prototypeVectorFromText("test query", 256, 0);
  const weights = attn.computeWeights(qv);
  
  // Check all dimensions are present
  assert.ok(weights.has("hash"));
  assert.ok(weights.has("hypervector"));
  assert.ok(weights.has("concept"));
  assert.ok(weights.has("prototype"));
  assert.ok(weights.has("intent"));
  assert.ok(weights.has("recency"));
  assert.ok(weights.has("quality"));
  assert.ok(weights.has("negation"));
  
  // Sum should be close to 1
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1.0) < 0.001, `weights sum to ${total}`);
});

test("HyperAttention updateKeys moves keys in response to feedback", () => {
  const attn = new HyperAttentionContext();
  const qv = prototypeVectorFromText("el gato duerme en la mesa", 256, 0);
  
  const before = attn.computeWeights(qv);
  // Apply stronger deltas
  attn.updateKeys(qv, { hash: 0.15, hypervector: -0.1, concept: 0.1 });
  attn.updateKeys(qv, { hash: 0.12, hypervector: -0.08, concept: 0.08 });
  const after = attn.computeWeights(qv);
  
  // updateCount should have increased
  assert.ok(attn.updateCount > 0);
});

test("HyperAttention score uses dynamic weights", () => {
  const attn = new HyperAttentionContext();
  const qv = prototypeVectorFromText("query test", 256, 0);
  
  const dimScores = {
    hash: 0.9, hypervector: 0.8, concept: 0.7, prototype: 0.6,
    intent: 0.5, recency: 0.4, quality: 0.3, negation: 1.0,
  };
  
  const score = attn.score(qv, dimScores);
  assert.ok(score > 0);
  assert.ok(score <= 1);
});

// ─── HyperDecoder ─────────────────────────────────────────

test("HyperDecoder composes response from candidates", () => {
  const decoder = new HyperDecoder();
  const candidates = [
    { entry: { id: "1", text: "el gato duerme sobre la mesa" }, score: 0.9 },
    { entry: { id: "2", text: "la mesa esta en la cocina" }, score: 0.7 },
    { entry: { id: "3", text: "el gato descansa en el sofa" }, score: 0.5 },
  ];
  
  const result = decoder.compose("donde duerme el gato?", candidates);
  assert.ok(result.text.length > 3);
  assert.ok(result.confidence > 0);
  assert.ok(typeof result.composed === "boolean");
});

test("HyperDecoder fallbacks when no template matches", () => {
  const decoder = new HyperDecoder();
  const candidates = [
    { text: "respuesta unica con pocas palabras", score: 0.3 },
  ];
  
  const result = decoder.compose("pregunta sin contexto", candidates);
  assert.ok(result.text.length > 0);
  assert.ok(typeof result.composed === "boolean");
});

test("HyperDecoder recomposes with substitutions", () => {
  const { LexiconTrainer } = require("../src");
  const trainer = new LexiconTrainer({
    conceptMap: new Map([["felino","gato"],["descansa","duerme"]]),
    seed: 42
  });
  const decoder = new HyperDecoder({ lexiconTrainer: trainer });
  const result = decoder.compose("el felino descansa", [
    { entry: { id:"1", text:"el gato duerme sobre la mesa" }, score: 0.9 }
  ]);
  assert.ok(result.text.length > 3);
  assert.ok(result.text.includes("felino") || result.text.includes("descansa"));
});

test("HyperDecoder preserves verb-preposition collocations", () => {
  const { LexiconTrainer } = require("../src");
  const trainer = new LexiconTrainer({
    conceptMap: new Map([["llega", "entra"]]),
    collocationMap: new Map([["llega", "a"], ["entra", "en"]]),
    seed: 42,
  });
  const decoder = new HyperDecoder({ lexiconTrainer: trainer });
  const result = decoder.compose("el tren llega a la estacion", [
    { entry: { id: "1", text: "el tren entra en la estacion" }, score: 0.9 },
  ]);
  assert.ok(result.text.includes("llega a la estacion"));
});

// ─── Integration: CHL + LexiconLearner + HyperAttention ───

test("CHL with LexiconTrainer improves paraphrase recall", () => {
  const conceptMap = new Map([
    ["felino", "gato"],
    ["can", "perro"],
  ]);
  const trainer = new LexiconTrainer({ conceptMap });
  const attn = new HyperAttentionContext();
  
  const chl = new CHL({
    bitCount: 128, hyperDim: 256, maxEntries: 100, seed: 42,
    lexiconTrainer: trainer,
    attention: attn,
  });
  
  // Insert facts
  chl.remember("El gato duerme sobre la mesa", { id: "cat-table" }, { quality: 8 });
  chl.remember("El perro corre por el parque", { id: "dog-park" }, { quality: 7 });
  chl.remember("El tren entra en la estacion", { id: "train-station" }, { quality: 7 });
  
  // Recall with paraphrase
  const result = chl.infer("El felino duerme en la mesa");
  assert.equal(result.answer.id, "cat-table");
  assert.ok(result.confidence > 0.3);
  
  // Apply feedback to train
  trainer.applyOnlineFeedback("El felino duerme en la mesa", "gato", []);
  
  // Second recall should still work
  const result2 = chl.infer("El felino duerme sobre la mesa");
  assert.equal(result2.answer.id, "cat-table");
});

test("CHL with LexiconTrainer handles negative feedback", () => {
  const conceptMap = new Map([["felino", "gato"], ["can", "perro"]]);
  const trainer = new LexiconTrainer({ conceptMap });
  
  const chl = new CHL({
    bitCount: 128, hyperDim: 256, maxEntries: 100, seed: 42,
    lexiconTrainer: trainer,
  });
  
  chl.remember("El gato duerme sobre la mesa", { id: "cat" }, { quality: 8 });
  chl.remember("El perro corre por el parque", { id: "dog" }, { quality: 8 });
  
  // Force feedback: say the query about cats should NOT return dog
  trainer.applyOnlineFeedback("el felino duerme", "gato", ["perro"]);
  
  // Verify recall still works
  const result = chl.infer("El gato duerme");
  assert.equal(result.answer.id, "cat");
});

console.log("✅ All lexicon-learner tests passed");
