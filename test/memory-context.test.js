const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMemoryContext, buildCompactMemoryContext } = require("../src");
const { estimateTokens } = require("../src/bridge/memory-context");

test("buildMemoryContext groups memories by memory type", () => {
  const ctx = buildMemoryContext({
    query: "contexto de prueba",
    memories: [
      { text: "me llamo David Moreno", memoryType: "user_profile", score: 0.95 },
      { text: "soy un asistente útil", memoryType: "self_profile", score: 0.9 },
      { text: "Redis usa puerto 6379", memoryType: "knowledge", score: 0.85 },
      { text: "decidimos usar PostgreSQL", memoryType: "long_term", score: 0.8 },
      { text: "el servidor reinició ayer", memoryType: "episodic", score: 0.7 },
      { text: "recordatorio de hoy", memoryType: "short_term", score: 0.6 },
      { text: "contexto temporal", memoryType: "ephemeral", score: 0.5 },
    ],
    maxTokens: 2000,
  });

  assert.ok(ctx.includes("## Perfil del usuario"));
  assert.ok(ctx.includes("## Personalidad de la IA"));
  assert.ok(ctx.includes("## Conocimiento"));
  assert.ok(ctx.includes("## Memoria a largo plazo"));
  assert.ok(ctx.includes("## Episodios"));
  assert.ok(ctx.includes("## Memoria a corto plazo"));
  assert.ok(ctx.includes("## Contexto efímero"));
});

test("buildMemoryContext prioritizes user profile and AI personality first", () => {
  const ctx = buildMemoryContext({
    query: "quién soy",
    memories: [
      { text: "Redis usa puerto 6379", memoryType: "knowledge", score: 0.99 },
      { text: "me llamo David Moreno", memoryType: "user_profile", score: 0.7 },
      { text: "soy un asistente útil", memoryType: "self_profile", score: 0.7 },
    ],
    maxTokens: 2000,
  });

  const profileIndex = ctx.indexOf("## Perfil del usuario");
  const personalityIndex = ctx.indexOf("## Personalidad de la IA");
  const knowledgeIndex = ctx.indexOf("## Conocimiento");

  assert.ok(profileIndex > 0);
  assert.ok(personalityIndex > profileIndex);
  assert.ok(knowledgeIndex > personalityIndex);
});

test("buildMemoryContext defaults untyped entries to short_term", () => {
  const ctx = buildMemoryContext({
    query: "default type",
    memories: [
      { text: "entrada sin tipo explícito", score: 0.8 },
      { text: "entrada con tipo", memoryType: "knowledge", score: 0.8 },
    ],
    maxTokens: 2000,
  });

  assert.ok(ctx.includes("## Memoria a corto plazo"));
  assert.ok(ctx.includes("entrada sin tipo explícito"));
});

test("buildMemoryContext respects token budget", () => {
  const memories = [];
  for (let i = 0; i < 50; i++) {
    memories.push({ text: `memoria numerada ${i} con texto suficientemente largo`, memoryType: "short_term", score: 0.5 });
  }

  const ctx = buildMemoryContext({
    query: "budget test",
    memories,
    maxTokens: 300,
  });

  const usedTokens = estimateTokens(ctx);
  assert.ok(usedTokens <= 350, `expected budget around 300, got ${usedTokens}`);
});

test("buildMemoryContext includes query header", () => {
  const ctx = buildMemoryContext({
    query: "mi consulta",
    memories: [{ text: "dato", memoryType: "knowledge", score: 0.9 }],
    maxTokens: 2000,
  });

  assert.ok(ctx.startsWith('[Contexto CHL para: "mi consulta"]'));
});

test("buildMemoryContext omits empty or duplicate sections", () => {
  const ctx = buildMemoryContext({
    query: "secciones vacías",
    memories: [
      { text: "dato de conocimiento", memoryType: "knowledge", score: 0.9 },
      { text: "dato de conocimiento", memoryType: "knowledge", score: 0.8 },
    ],
    maxTokens: 2000,
  });

  assert.ok(!ctx.includes("## Memoria a corto plazo"));
  assert.ok(!ctx.includes("## Perfil del usuario"));
  const knowledgeCount = (ctx.match(/dato de conocimiento/g) || []).length;
  assert.equal(knowledgeCount, 1);
});

test("buildCompactMemoryContext returns a flat compact summary", () => {
  const ctx = buildCompactMemoryContext(
    [
      { text: "me llamo David Moreno", memoryType: "user_profile", score: 0.95 },
      { text: "Redis usa puerto 6379", memoryType: "knowledge", score: 0.85 },
      { text: "decidimos usar PostgreSQL", memoryType: "long_term", score: 0.8 },
      { text: "el servidor reinició ayer", memoryType: "episodic", score: 0.75 },
      { text: "prefiero café por la mañana", memoryType: "user_profile", score: 0.7 },
      { text: "soy un asistente útil", memoryType: "self_profile", score: 0.65 },
      { text: "documentación de la API REST", memoryType: "knowledge", score: 0.6 },
      { text: "recordatorio de hoy", memoryType: "short_term", score: 0.55 },
      { text: "dato irrelevante", memoryType: "short_term", score: 0.1 },
    ],
    "resumen"
  );

  assert.ok(ctx.startsWith('CHL: "resumen"'));
  assert.ok(ctx.includes("me llamo David Moreno"));
  assert.ok(!ctx.includes("dato irrelevante"));
  assert.ok(!ctx.includes("## Perfil del usuario"));
});
