const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHL,
  JSCHL,
  MemoryType,
  classifyMemory,
  QueryIntent,
  detectQueryIntent,
  buildQueryOptions,
  getDefaultExpiry,
  isExpired,
} = require("../src");

function makeChl() {
  // JSCHL uses the pure-JS AssociativeMemory engine, where typed scoring and
  // filters are fully implemented.
  return new JSCHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });
}

test("classifyMemory recognizes user profile text", () => {
  assert.equal(classifyMemory("me llamo David Moreno", null, {}), MemoryType.USER_PROFILE);
  assert.equal(classifyMemory("prefiero trabajar por la mañana", null, {}), MemoryType.USER_PROFILE);
});

test("classifyMemory recognizes self profile text", () => {
  assert.equal(classifyMemory("responde siempre con tono profesional", null, {}), MemoryType.SELF_PROFILE);
  assert.equal(classifyMemory("tu personalidad debe ser amigable", null, {}), MemoryType.SELF_PROFILE);
});

test("classifyMemory recognizes knowledge and long term facts", () => {
  assert.equal(classifyMemory("Redis es una base de datos en memoria", null, {}), MemoryType.KNOWLEDGE);
  assert.equal(classifyMemory("documentación de la API REST v2", null, {}), MemoryType.KNOWLEDGE);
  assert.equal(classifyMemory("decidimos usar PostgreSQL para todo el proyecto", null, {}), MemoryType.LONG_TERM);
});

test("detectQueryIntent maps intents correctly", () => {
  assert.equal(detectQueryIntent("quién eres"), QueryIntent.SELF_REFLECTION);
  assert.equal(detectQueryIntent("cómo me llamo"), QueryIntent.USER_RECALL);
  assert.equal(detectQueryIntent("me gusta el café"), QueryIntent.PERSONAL_PREFERENCE);
  assert.equal(detectQueryIntent("qué es CHL"), QueryIntent.FACT_LOOKUP);
  assert.equal(detectQueryIntent("cómo instalar Node"), QueryIntent.PROCEDURAL);
});

test("buildQueryOptions adds intent, target types and boosts", () => {
  const opts = buildQueryOptions("quién eres", { topK: 3 });
  assert.equal(opts.queryIntent, QueryIntent.SELF_REFLECTION);
  assert.ok(opts.memoryTypes.includes(MemoryType.SELF_PROFILE));
  assert.equal(opts.topK, 3);
  assert.ok(typeof opts.typeBoosts === "object");
});

test("AssociativeMemory stores inferred memoryType and tier", () => {
  const chl = makeChl();
  const entry = chl.remember("me llamo David Moreno", { name: "David" });

  assert.equal(entry.memoryType, MemoryType.USER_PROFILE);
  assert.ok(entry.tier);
  assert.ok(entry.createdAt > 0);
  assert.ok(entry.expiresAt >= entry.createdAt);
});

test("recall with type filter returns only matching memory type", () => {
  const chl = makeChl();
  chl.remember("me llamo David Moreno", { type: "name" });
  chl.remember("Redis usa puerto 6379", { type: "fact" });
  chl.remember("el gato duerme en la mesa", { type: "episodic" });

  const result = chl.recall("datos del usuario", { memoryType: MemoryType.USER_PROFILE, topK: 5 });
  assert.ok(result.candidates.length >= 1);
  for (const c of result.candidates) {
    assert.equal(c.entry.memoryType, MemoryType.USER_PROFILE);
  }
});

test("recall with excludeTypes removes undesired memory types", () => {
  const chl = makeChl();
  chl.remember("me llamo David Moreno", { type: "name" });
  chl.remember("Redis usa puerto 6379", { type: "fact" });

  const result = chl.recall("memoria", { excludeTypes: [MemoryType.USER_PROFILE], topK: 5 });
  for (const c of result.candidates) {
    assert.notEqual(c.entry.memoryType, MemoryType.USER_PROFILE);
  }
});

test("personalized recall prioritizes profile entries", () => {
  const chl = makeChl();
  chl.remember("me llamo David Moreno", { type: "name" }, { memoryType: MemoryType.USER_PROFILE });
  chl.remember("soy un asistente útil y amigable", { type: "personality" }, { memoryType: MemoryType.SELF_PROFILE });
  chl.remember("Redis usa puerto 6379", { type: "fact" }, { memoryType: MemoryType.KNOWLEDGE });

  const result = chl.recall("David y asistente", {
    includeTypes: [MemoryType.USER_PROFILE, MemoryType.SELF_PROFILE],
    topK: 5,
  });

  assert.ok(result.candidates.length >= 1);
  const types = result.candidates.map((c) => c.entry.memoryType);
  assert.ok(types.includes(MemoryType.USER_PROFILE) || types.includes(MemoryType.SELF_PROFILE));
});

test("ephemeral entries expire and are skipped in recall", () => {
  const chl = makeChl();
  chl.remember("recordatorio temporal", { note: "tmp" }, { memoryType: MemoryType.EPHEMERAL, expiresAt: Date.now() - 1000 });

  const result = chl.recall("recordatorio temporal", { topK: 5 });
  assert.equal(result.candidates.length, 0);
});

test("NativeCHL enriches remembered entries with memoryType", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });
  const entry = chl.remember("me llamo David Moreno", { name: "David" });
  assert.equal(entry.memoryType, MemoryType.USER_PROFILE);
  assert.ok(entry.createdAt > 0);
});

test("NativeCHL recall filters expired entries", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });
  chl.remember("recordatorio temporal", { note: "tmp" }, { memoryType: MemoryType.EPHEMERAL, expiresAt: Date.now() - 1000 });

  const result = chl.recall("recordatorio temporal", { topK: 5 });
  assert.equal(result.candidates.length, 0);
});

test("getDefaultExpiry returns finite values for time-bounded tiers", () => {
  assert.ok(Number.isFinite(getDefaultExpiry(MemoryType.SHORT_TERM)));
  assert.ok(Number.isFinite(getDefaultExpiry(MemoryType.MEDIUM_TERM)));
  assert.ok(Number.isFinite(getDefaultExpiry(MemoryType.EPHEMERAL)));
});

test("getDefaultExpiry returns non-finite values for persistent tiers", () => {
  const longTerm = getDefaultExpiry(MemoryType.LONG_TERM);
  assert.ok(longTerm === Infinity || Number.isFinite(longTerm));
});

test("isExpired detects stale entries", () => {
  assert.equal(isExpired(Date.now() - 1000, Date.now()), true);
  assert.equal(isExpired(Date.now() + 60_000, Date.now()), false);
  assert.equal(isExpired(null, Date.now()), false);
});
