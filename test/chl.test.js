const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { EventEmitter } = require("node:events");
const {
  CHL,
  JSCHL,
  hammingDistance,
  hammingSimilarity,
  semanticHashFromText,
} = require("../src");
const { saveLexiconState } = require("../src/concepts");
const { createServer } = require("../src/server");
const { createMcpContext, handleMcpMessage } = require("../src/mcp");
const { createFramedReader } = require("../src/mcp-server");

function invokeServer(server, { method, url, body }) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(body ? [Buffer.from(body)] : []);
    req.method = method;
    req.url = url;

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.writeHead = (statusCode, headers = {}) => {
      res.statusCode = statusCode;
      res.headers = headers;
    };
    let chunks = [];
    res.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    };
    res.end = (chunk) => {
      if (chunk) res.write(chunk);
      const buffer = Buffer.concat(chunks);
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: buffer.toString("utf8"),
        buffer,
      });
    };

    req.on("error", reject);
    server.emit("request", req, res);
  });
}

test("semantic hashes keep nearby text closer than unrelated text", () => {
  const a = semanticHashFromText("el perro come en el parque");
  const b = semanticHashFromText("el perro corre en el parque");
  const c = semanticHashFromText("motores termicos y redes de grafos");

  assert.ok(hammingSimilarity(a, b) > hammingSimilarity(a, c));
  assert.ok(hammingDistance(a, b) < hammingDistance(a, c));
});

test("memory recall returns the nearest payload", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember(
    "El gato duerme sobre la mesa",
    { fact: "cat-on-table", relations: [{ key: "located_in", value: "mesa" }] },
    { quality: 8 }
  );
  chl.remember(
    "El tren entra en la estacion",
    { fact: "train-station" },
    { quality: 7 }
  );

  const result = chl.infer("El gato duerme en la mesa");
  assert.equal(result.answer.fact, "cat-on-table");
  assert.ok(result.confidence > 0.3);
});

test("concept graph extracts entities and relations from stored memories", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember("El gato duerme sobre la mesa", { fact: "cat-on-table" }, { quality: 8 });
  chl.remember("La llave abre la puerta", { fact: "key-door" }, { quality: 7 });

  const graph = chl.conceptGraph();
  const entityLabels = graph.nodes.filter((node) => node.type === "entity").map((node) => node.label);
  const relationLabels = graph.edges.filter((edge) => edge.type === "relation").map((edge) => edge.label);

  assert.ok(entityLabels.includes("el gato"));
  assert.ok(entityLabels.includes("la mesa"));
  assert.ok(relationLabels.includes("duerme_sobre"));
  assert.ok(relationLabels.includes("abre"));
  assert.ok(graph.stats.nodeCount >= 4);
  assert.ok(graph.stats.edgeCount >= 2);
});

test("thought engine builds a structured hypothesis trace", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember("El gato duerme sobre la mesa", { fact: "cat-on-table" }, { quality: 8 });
  chl.remember("La llave abre la puerta", { fact: "key-door" }, { quality: 7 });

  const thought = chl.think("El gato duerme en la mesa", { topK: 3 });

  assert.ok(Array.isArray(thought.hypotheses));
  assert.ok(thought.hypotheses.length > 0);
  assert.ok(thought.best);
  assert.ok(thought.confidence >= 0);
  assert.ok(thought.best.evidence.concepts.length > 0 || thought.best.evidence.focusTokens.length > 0);
});

test("plan and verify close the reasoning loop", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember("El gato duerme sobre la mesa", { fact: "cat-on-table" }, { quality: 8 });
  chl.remember("La llave abre la puerta", { fact: "key-door" }, { quality: 7 });

  const plan = chl.plan("El gato duerme en la mesa", { topK: 3 });
  const verification = chl.verify(plan, { topK: 3 });

  assert.ok(Array.isArray(plan.steps));
  assert.ok(plan.steps.length >= 2);
  assert.ok(plan.confidence >= 0);
  assert.ok(Array.isArray(verification.checks));
  assert.ok(verification.checks.length === plan.steps.length);
  assert.ok(typeof verification.verified === "boolean");
  assert.ok(verification.confidence >= 0);
});

test("ask chooses between answer clarify and plan", () => {
  const chl = new JSCHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember("El gato duerme sobre la mesa", { fact: "cat-on-table" }, { quality: 8 });

  const answer = chl.ask("El gato duerme en la mesa", { topK: 3 });
  const clarify = chl.ask("Como deberia proceder con este tema?", { topK: 3 });

  assert.ok(["answer", "plan", "clarify"].includes(answer.kind));
  assert.ok(answer.confidence >= 0);
  assert.ok(typeof answer.responseText === "string" && answer.responseText.length > 0);
  assert.ok(typeof answer.explanation === "string" && answer.explanation.length > 0);
  assert.ok(Array.isArray(answer.claims));
  assert.ok(answer.generation && typeof answer.generation === "object");
  assert.equal(chl.decisionEpisodes().length, 2);
  assert.equal(clarify.kind, "clarify");
});

test("learning from verification updates the semantic bias", () => {
  const chl = new JSCHL({ bitCount: 128, hyperDim: 256, maxEntries: 100 });

  chl.remember("Memoria semantica compacta", { id: "one" });
  const before = Array.from(chl.memory.bitBias);

  const verification = {
    verified: true,
    confidence: 0.9,
    plan: { query: "Memoria semantica compacta" },
    thought: {
      best: {
        evidence: {
          text: "Memoria semantica compacta",
        },
      },
    },
  };

  const result = chl.learnFromVerification(verification);
  const after = Array.from(chl.memory.bitBias);

  assert.ok(result.ok);
  assert.ok(result.reward > 0);
  assert.ok(after.some((value, index) => value !== before[index]));
});

test("decision episodes are exposed over HTTP", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-episodes-"));
  const persistPath = path.join(dir, "memory.log");
  const server = createServer({ memory: { persistPath, bitCount: 128, hyperDim: 256 } });

  await invokeServer(server, {
    method: "POST",
    url: "/remember",
    body: JSON.stringify({
      text: "El gato duerme sobre la mesa",
      payload: { fact: "cat" },
      metadata: { quality: 8 },
    }),
  });

  await invokeServer(server, {
    method: "POST",
    url: "/ask",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 3 }),
  });

  const episodesResponse = await invokeServer(server, {
    method: "GET",
    url: "/episodes",
  });

  const episodes = JSON.parse(episodesResponse.body);
  assert.ok(Array.isArray(episodes));
  assert.equal(episodes.length, 1);
  assert.ok(["answer", "plan", "clarify"].includes(episodes[0].kind));
  assert.ok(typeof episodes[0].responseText === "string");
});

test("episodes consolidate into semantic rules over HTTP", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-consolidate-"));
  const persistPath = path.join(dir, "memory.log");
  const server = createServer({ memory: { persistPath, bitCount: 128, hyperDim: 256 } });

  await invokeServer(server, {
    method: "POST",
    url: "/remember",
    body: JSON.stringify({
      text: "El gato duerme sobre la mesa",
      payload: { fact: "cat-on-table" },
      metadata: { quality: 8 },
    }),
  });

  await invokeServer(server, {
    method: "POST",
    url: "/ask",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 3 }),
  });

  await invokeServer(server, {
    method: "POST",
    url: "/ask",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 3 }),
  });

  const consolidateResponse = await invokeServer(server, {
    method: "POST",
    url: "/consolidate",
    body: JSON.stringify({ minSupport: 2 }),
  });
  const stateResponse = await invokeServer(server, {
    method: "GET",
    url: "/state",
  });

  const consolidation = JSON.parse(consolidateResponse.body);
  const state = JSON.parse(stateResponse.body);

  assert.ok(consolidation.ok);
  assert.ok(consolidation.ruleCount >= 1);
  assert.equal(consolidation.nextEpisodeIndex, 2);
  assert.equal(state.consolidation.lastEpisodeIndex, 2);
  assert.equal(state.entries.length, 2);
  assert.ok(state.entries.some((entry) => String(entry.payloadJson).includes("episode_rule")));
});

test("automatic consolidation runs in the background after N episodes", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-auto-consolidate-"));
  const persistPath = path.join(dir, "memory.log");
  const server = createServer({
    memory: {
      persistPath,
      bitCount: 128,
      hyperDim: 256,
      autoConsolidationEvery: 2,
      autoConsolidationMinConfidence: 0,
      autoConsolidationMinSupport: 2,
    },
  });

  await invokeServer(server, {
    method: "POST",
    url: "/remember",
    body: JSON.stringify({
      text: "El gato duerme sobre la mesa",
      payload: { fact: "cat-on-table" },
      metadata: { quality: 8 },
    }),
  });

  await invokeServer(server, {
    method: "POST",
    url: "/ask",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 3 }),
  });

  await invokeServer(server, {
    method: "POST",
    url: "/ask",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 3 }),
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  const stateResponse = await invokeServer(server, {
    method: "GET",
    url: "/state",
  });
  const state = JSON.parse(stateResponse.body);

  assert.equal(state.consolidation.lastEpisodeIndex, 2);
  assert.ok(state.consolidation.auto.completed >= 1);
  assert.ok(state.entries.some((entry) => String(entry.payloadJson).includes("episode_rule")));
});

test("high confidence threshold suppresses auto consolidation", async () => {
  const chl = new JSCHL({
    bitCount: 128,
    hyperDim: 256,
    autoConsolidationEvery: 1,
    autoConsolidationMinConfidence: 1,
    autoConsolidationMinSupport: 2,
  });

  chl.remember("El gato duerme sobre la mesa", { fact: "cat-on-table" }, { quality: 8 });
  chl.ask("El gato duerme en la mesa", { topK: 3 });
  chl.ask("El gato duerme en la mesa", { topK: 3 });

  await new Promise((resolve) => setTimeout(resolve, 25));

  const state = chl.consolidationState();
  const entries = chl.memory.entries.values ? Array.from(chl.memory.entries.values()) : [];

  assert.equal(state.lastEpisodeIndex, 0);
  assert.ok(state.auto.skipped >= 1);
  assert.ok(!entries.some((entry) => String(entry.text).includes("Patron consolidado")));
});

test("feedback updates the semantic bias without breaking recall", () => {
  const chl = new CHL({ bitCount: 128, hyperDim: 256 });

  chl.remember("Memoria semantica compacta", { id: "one" });
  chl.remember("Memoria simbolica compacta", { id: "two" });
  const before = chl.confidenceFor("Memoria compacta");

  chl.updateFeedback("Memoria compacta", 1);
  const after = chl.confidenceFor("Memoria compacta");

  assert.ok(after >= before - 0.05);
});

test("persistent memory survives reinits", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-persist-"));
  const persistPath = path.join(dir, "memory.log");

  const first = new CHL({
    bitCount: 128,
    hyperDim: 256,
    persistPath,
  });
  await first.whenReady();
  first.remember("El gato duerme sobre la mesa", { fact: "cat" }, { quality: 8 });
  first.remember("El tren entra en la estacion", { fact: "train" }, { quality: 7 });

  const second = new CHL({
    bitCount: 128,
    hyperDim: 256,
    persistPath,
  });
  await second.whenReady();
  const result = second.infer("El gato duerme en la mesa");

  assert.equal(result.answer.fact, "cat");
  assert.ok(fs.readFileSync(persistPath, "utf8").trim().length > 0);
});

test("lexicon persistence survives reinits and restore", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-lexicon-"));
  const persistPath = path.join(dir, "memory.log");
  const conceptsPath = path.join(dir, "memory.concepts.tsv");
  const phrasesPath = path.join(dir, "memory.phrases.tsv");

  saveLexiconState(
    {
      concepts: [
        ["felino", "gato"],
        ["va", "circula"],
      ],
      phrases: [
        ["se mueve por", "corre por"],
        ["da luz a", "ilumina"],
      ],
    },
    { conceptsPath, phrasesPath }
  );

  const first = new CHL({
    bitCount: 128,
    hyperDim: 256,
    persistPath,
    conceptsPath,
    phrasesPath,
  });
  await first.whenReady();
  const backup = first.backup();

  assert.equal(backup.lexicon.concepts.length, 2);
  assert.equal(backup.lexicon.phrases.length, 2);

  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-lexicon-restore-"));
  const restorePath = path.join(restoreDir, "memory.log");
  const restoreConceptsPath = path.join(restoreDir, "memory.concepts.tsv");
  const restorePhrasesPath = path.join(restoreDir, "memory.phrases.tsv");

  const second = new CHL({
    bitCount: 128,
    hyperDim: 256,
    persistPath: restorePath,
    conceptsPath: restoreConceptsPath,
    phrasesPath: restorePhrasesPath,
  });
  await second.whenReady();
  const restored = second.restore(backup, { replace: true });

  assert.ok(restored.ok);
  assert.ok(fs.readFileSync(restoreConceptsPath, "utf8").includes("felino\tgato"));
  assert.ok(fs.readFileSync(restorePhrasesPath, "utf8").includes("se mueve por\tcorre por"));
});

test("backup and restore work over HTTP", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-http-"));
  const persistPath = path.join(dir, "memory.log");
  const server = createServer({ memory: { persistPath, bitCount: 128, hyperDim: 256 } });

  await invokeServer(server, {
    method: "POST",
    url: "/remember",
    body: JSON.stringify({
      text: "El gato duerme sobre la mesa",
      payload: { fact: "cat" },
      metadata: { quality: 8 },
    }),
  });

  const backupResponse = await invokeServer(server, {
    method: "GET",
    url: "/backup.memory",
  });
  assert.ok(backupResponse.buffer.slice(0, 4).toString("utf8") === "CHLB");

  const restoreDir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-http-restore-"));
  const restorePath = path.join(restoreDir, "memory.log");
  const backupPath = path.join(restoreDir, "backup.memory");
  fs.writeFileSync(backupPath, backupResponse.buffer);
  const restoreServer = createServer({ memory: { persistPath: restorePath, bitCount: 128, hyperDim: 256 } });

  const restoredResponse = await invokeServer(restoreServer, {
    method: "POST",
    url: "/restore.memory",
    body: fs.readFileSync(backupPath),
  });
  const inferResponse = await invokeServer(restoreServer, {
    method: "POST",
    url: "/infer",
    body: JSON.stringify({ query: "El gato duerme en la mesa", topK: 1 }),
  });
  const restored = JSON.parse(restoredResponse.body);
  const infer = JSON.parse(inferResponse.body);

  assert.ok(restored.ok);
  assert.equal(infer.answer.fact, "cat");
});

test("HTTP exposes the active memory profile", async () => {
  const server = createServer({
    profile: "large",
    memory: { bitCount: 128, hyperDim: 256 },
  });

  const response = await invokeServer(server, {
    method: "GET",
    url: "/profile",
  });
  const payload = JSON.parse(response.body);

  assert.equal(payload.profile, "large");
});

test("backup and restore are exposed through MCP tools", async () => {
  const context = createMcpContext({
    memory: { bitCount: 128, hyperDim: 256 },
  });

  await handleMcpMessage(context, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "chl_remember",
      arguments: {
        input: "El gato duerme sobre la mesa",
        payload: { fact: "cat" },
        metadata: { quality: 8 },
      },
    },
  });

  const listed = await handleMcpMessage(context, { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
  const backup = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "chl_backup_memory", arguments: { backupPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chl-mcp-backup-")), "backup.memory") } },
  });
  const backupPayload = JSON.parse(backup.result.content[0].text);

  const fresh = createMcpContext({
    memory: { bitCount: 128, hyperDim: 256 },
  });
  const restored = await handleMcpMessage(fresh, {
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "chl_restore_memory", arguments: { backupPath: backupPayload.path, replace: true } },
  });

  const snapshot = await handleMcpMessage(fresh, {
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "chl_state", arguments: {} },
  });
  const statePayload = JSON.parse(snapshot.result.content[0].text);
  const infer = await handleMcpMessage(fresh, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "chl_infer", arguments: { query: "El gato duerme en la mesa", topK: 1 } },
  });
  const learn = await handleMcpMessage(fresh, {
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "chl_learn", arguments: { input: "El gato duerme sobre la mesa", reward: 1 } },
  });
  const recall = await handleMcpMessage(fresh, {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "chl_recall", arguments: { query: "mesa", topK: 1 } },
  });
  const resources = await handleMcpMessage(fresh, { jsonrpc: "2.0", id: 10, method: "resources/list", params: {} });
  const resourceRead = await handleMcpMessage(fresh, { jsonrpc: "2.0", id: 11, method: "resources/read", params: { uri: "chl://memory" } });
  const backupResource = await handleMcpMessage(fresh, { jsonrpc: "2.0", id: 12, method: "resources/read", params: { uri: "chl://backup.memory" } });
  const entriesPayload = JSON.parse(resourceRead.result.contents[0].text);
  const backupResourcePayload = backupResource.result.contents[0];
  const inferPayload = JSON.parse(infer.result.content[0].text);
  const recallPayload = JSON.parse(recall.result.content[0].text);

  assert.ok(Array.isArray(listed.result.tools));
  assert.ok(backupPayload.ok);
  assert.ok(fs.existsSync(backupPayload.path));
  assert.ok(restored.result.content[0].text.includes("\"ok\": true"));
  assert.equal(statePayload.entries.length, 1);
  assert.ok(resources.result.resources.length >= 5);
  assert.equal(entriesPayload.entries.length, 1);
  assert.equal(backupResourcePayload.mimeType, "application/octet-stream");
  assert.ok(Buffer.isBuffer(backupResourcePayload.blob));
  assert.equal(inferPayload.answer.fact, "cat");
  assert.ok(Array.isArray(recallPayload.candidates));
  assert.ok(learn.result.content[0].text.length > 0);
});

test("HTTP exposes the learned lexicon for inspection and export", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-http-lexicon-"));
  const persistPath = path.join(dir, "memory.log");
  const conceptsPath = path.join(dir, "memory.concepts.tsv");
  const phrasesPath = path.join(dir, "memory.phrases.tsv");
  saveLexiconState(
    {
      concepts: [
        ["felino", "gato"],
        ["circula", "va"],
      ],
      phrases: [
        ["se mueve por", "corre por"],
        ["da luz a", "ilumina"],
      ],
    },
    { conceptsPath, phrasesPath }
  );

  const server = createServer({
    memory: {
      bitCount: 128,
      hyperDim: 256,
      persistPath,
      conceptsPath,
      phrasesPath,
    },
  });

  const lexiconResponse = await invokeServer(server, {
    method: "GET",
    url: "/lexicon",
  });
  const conceptsResponse = await invokeServer(server, {
    method: "GET",
    url: "/lexicon.concepts.tsv",
  });
  const phrasesResponse = await invokeServer(server, {
    method: "GET",
    url: "/lexicon.phrases.tsv",
  });
  const combinedResponse = await invokeServer(server, {
    method: "GET",
    url: "/lexicon.tsv",
  });

  const lexicon = JSON.parse(lexiconResponse.body);
  assert.equal(lexicon.counts.concepts, 2);
  assert.equal(lexicon.counts.phrases, 2);
  assert.ok(conceptsResponse.body.includes("felino\tgato"));
  assert.ok(phrasesResponse.body.includes("se mueve por\tcorre por"));
  assert.ok(combinedResponse.body.includes("# concepts"));
  assert.ok(combinedResponse.body.includes("# phrases"));
});

test("MCP exposes the learned lexicon for inspection and export", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chl-mcp-lexicon-"));
  const persistPath = path.join(dir, "memory.log");
  const conceptsPath = path.join(dir, "memory.concepts.tsv");
  const phrasesPath = path.join(dir, "memory.phrases.tsv");
  saveLexiconState(
    {
      concepts: [
        ["felino", "gato"],
        ["circula", "va"],
      ],
      phrases: [
        ["se mueve por", "corre por"],
        ["da luz a", "ilumina"],
      ],
    },
    { conceptsPath, phrasesPath }
  );

  const context = createMcpContext({
    memory: {
      bitCount: 128,
      hyperDim: 256,
      persistPath,
      conceptsPath,
      phrasesPath,
    },
  });

  const tool = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "chl_lexicon", arguments: {} },
  });
  const exportTool = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 21,
    method: "tools/call",
    params: { name: "chl_lexicon_export", arguments: {} },
  });
  const resource = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 22,
    method: "resources/read",
    params: { uri: "chl://lexicon.tsv" },
  });
  const parsed = JSON.parse(tool.result.content[0].text);
  const exportPayload = JSON.parse(exportTool.result.content[0].text);

  assert.equal(parsed.counts.concepts, 2);
  assert.equal(parsed.counts.phrases, 2);
  assert.equal(exportPayload.format, "chl-lexicon-tsv-v1");
  assert.ok(exportPayload.export.conceptsTsv.includes("felino\tgato"));
  assert.ok(resource.result.contents[0].text.includes("# phrases"));
});

test("MCP exposes episode consolidation", async () => {
  const context = createMcpContext({
    memory: { bitCount: 128, hyperDim: 256 },
  });

  await handleMcpMessage(context, { jsonrpc: "2.0", id: 30, method: "initialize", params: {} });
  await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 31,
    method: "tools/call",
    params: {
      name: "chl_remember",
      arguments: {
        input: "El gato duerme sobre la mesa",
        payload: { fact: "cat-on-table" },
        metadata: { quality: 8 },
      },
    },
  });
  await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 32,
    method: "tools/call",
    params: { name: "chl_ask", arguments: { query: "El gato duerme en la mesa", topK: 3 } },
  });
  await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 33,
    method: "tools/call",
    params: { name: "chl_ask", arguments: { query: "El gato duerme en la mesa", topK: 3 } },
  });

  const consolidate = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 34,
    method: "tools/call",
    params: { name: "chl_consolidate", arguments: { minSupport: 2 } },
  });
  const consolidationResource = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 35,
    method: "resources/read",
    params: { uri: "chl://consolidation" },
  });

  const consolidatePayload = JSON.parse(consolidate.result.content[0].text);
  const resourcePayload = JSON.parse(consolidationResource.result.contents[0].text);

  assert.ok(consolidatePayload.ok);
  assert.ok(consolidatePayload.ruleCount >= 1);
  assert.equal(resourcePayload.consolidation.lastEpisodeIndex, 2);
  assert.equal(resourcePayload.episodes.length, 2);
});

test("MCP exposes the active memory profile", async () => {
  const context = createMcpContext({
    profile: "large",
    memory: { bitCount: 128, hyperDim: 256 },
  });

  const response = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "chl_profile", arguments: {} },
  });
  const toolPayload = JSON.parse(response.result.content[0].text);
  const resource = await handleMcpMessage(context, {
    jsonrpc: "2.0",
    id: 13,
    method: "resources/read",
    params: { uri: "chl://profile" },
  });
  const resourcePayload = JSON.parse(resource.result.contents[0].text);

  assert.equal(toolPayload.profile, "large");
  assert.equal(resourcePayload.profile, "large");
});

test("MCP reader handles multiple JSON messages in one chunk", () => {
  const input = new EventEmitter();
  const messages = [];

  createFramedReader((message) => {
    messages.push(message);
  }, input);

  input.emit(
    "data",
    Buffer.from(
      "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\",\"params\":{}}\n"
    )
  );

  assert.equal(messages.length, 2);
  assert.equal(messages[0].id, 1);
  assert.equal(messages[1].id, 2);
});
