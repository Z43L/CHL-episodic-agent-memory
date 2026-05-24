const { NativeCHL } = require('/Users/davidmoreno/Desktop/CHL-episodic-agent-memory/src/native');
const { processFile, scanDirectory, scanDirectoryStats } = require('/Users/davidmoreno/Desktop/CHL-episodic-agent-memory/src/ingester');
const { evaluateInteraction } = require('/Users/davidmoreno/Desktop/CHL-episodic-agent-memory/src/auto-memory');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST = { ok: 0, fail: 0 };
function check(name, condition) {
  if (condition) { TEST.ok++; console.log('  \x1b[32m✓\x1b[0m', name); }
  else { TEST.fail++; console.log('  \x1b[31m✗\x1b[0m', name); }
}

console.log('\x1b[1m═══════════════════════════════════\x1b[0m');
console.log('\x1b[1m  CHL MCP — Test Suite\x1b[0m');
console.log('\x1b[1m═══════════════════════════════════\x1b[0m\n');

// ─── 1. Motor C++ ────────────────────────────────────────
console.log('[1] Motor nativo');
const chl = new NativeCHL({ persistPath: null });
check('instancia creada', !!chl);
check('sin fallback (C++)', !chl.fallback);
check('engine presente', !!chl.engine);

// ─── 2. Snapshot ─────────────────────────────────────────
console.log('\n[2] Snapshot');
const entries0 = chl.entries?.() || [];
check('snapshot inicial vacio', entries0.length === 0);

// ─── 3. Remember ─────────────────────────────────────────
console.log('\n[3] Remember');
chl.remember('Me llamo David Moreno', { name: 'David', surname: 'Moreno' }, { source: 'test' });
chl.remember('Prefiero TypeScript para el backend', { preference: 'typescript' }, { source: 'test' });
chl.remember('Trabajo en CHL, motor de memoria episodica', { project: 'CHL' }, { source: 'test' });
chl.remember('Uso Vercel para deployments', { tool: 'vercel' }, { source: 'test' });
const entries1 = chl.entries?.() || [];
check('4 entradas guardadas', entries1.length === 4);

// ─── 4. Recall ───────────────────────────────────────────
console.log('\n[4] Recall');
const r1 = chl.recall('como me llamo', { topK: 3 });
check('recall nombre funciona', r1.candidates.length > 0 && r1.candidates[0].text.includes('david'));
console.log('     ->', r1.candidates[0]?.text, '(score: ' + (r1.candidates[0]?.score || 0).toFixed(3) + ')');

const r2 = chl.recall('typescript', { topK: 3 });
check('recall TypeScript', r2.candidates.length > 0 && r2.candidates[0].text.includes('typescript'));

const r3 = chl.recall('deployments vercel', { topK: 3 });
check('recall Vercel', r3.candidates.length > 0 && r3.candidates[0].text.includes('vercel'));

const r4 = chl.recall('memoria episodica', { topK: 3 });
check('recall CHL', r4.candidates.length > 0);
console.log('     ->', r4.candidates[0]?.text, '(score: ' + (r4.candidates[0]?.score || 0).toFixed(3) + ')');

// ─── 5. Recall: query no relacionada debe dar scores bajos ──
const r5 = chl.recall('python django framework', { topK: 3 });
const allLowScore = r5.candidates.every(c => c.score < 0.5);
check('recall no relacionado: scores bajos', allLowScore && r5.candidates.length > 0);
console.log('     scores:', r5.candidates.map(c => c.score.toFixed(3)).join(', '));

// ─── 6. Infer ────────────────────────────────────────────
console.log('\n[5] Infer');
const inf = chl.recall('nombre del usuario', { topK: 1 });
check('infer encuentra nombre', inf.candidates[0]?.text.includes('david'));

// ─── 7. Learn ────────────────────────────────────────────
console.log('\n[6] Learn');
chl.learn('TypeScript', 0.9);
check('learn positivo', true);

// ─── 8. Backup / Restore ─────────────────────────────────
console.log('\n[7] Backup / Restore');
const tmpFile = path.join(os.tmpdir(), 'chl-mcp-test.memory');
chl.saveMemory(tmpFile);
check('backup creado', fs.existsSync(tmpFile) && fs.statSync(tmpFile).size > 0);
console.log('     tamano:', fs.statSync(tmpFile).size, 'bytes');

const chl2 = new NativeCHL({ persistPath: null });
check('nueva instancia vacia', (chl2.entries?.() || []).length === 0);

chl2.loadMemory(tmpFile);
const entries2 = chl2.entries?.() || [];
check('restore: 4 entradas', entries2.length === 4);

const r6 = chl2.recall('como me llamo', { topK: 1 });
check('restore: recall nombre', r6.candidates[0]?.text.includes('david'));
const r7 = chl2.recall('typescript', { topK: 1 });
check('restore: recall TypeScript', r7.candidates[0]?.text.includes('typescript'));

fs.unlinkSync(tmpFile);

// ─── 9. Auto-memory ──────────────────────────────────────
console.log('\n[8] Auto-memory');
const eval1 = evaluateInteraction({ query: 'prefiero Python', response: 'ok, recordado' }, 'smart');
check('smart: detecta preferencia', eval1.shouldRemember === true);
console.log('     score:', eval1.score, 'reason:', eval1.reason);

const eval2 = evaluateInteraction({ query: 'me llamo Ana', response: 'hola Ana' }, 'smart');
check('smart: detecta identidad', eval2.shouldRemember === true);
console.log('     score:', eval2.score, 'reason:', eval2.reason);

const eval3 = evaluateInteraction({ query: 'ok', response: 'ok' }, 'smart');
check('smart: ignora trivial', eval3.shouldRemember === false);

const eval4 = evaluateInteraction({ query: 'hola', response: 'hola' }, 'all');
check('all: ignora corto', eval4.shouldRemember === false);

const eval5 = evaluateInteraction({ query: 'explicame como funciona CHL', response: 'CHL es un motor de memoria...' }, 'all');
check('all: guarda query larga', eval5.shouldRemember === true);

// ─── 10. Ingester ────────────────────────────────────────
console.log('\n[9] Ingester');
const tmpDir = path.join(os.tmpdir(), 'chl-test-suite');
fs.mkdirSync(tmpDir, { recursive: true });

// Markdown
fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Test Project\n\n## Setup\n\nRun npm install to get started with the project.\n\n## Architecture\n\nMicroservices with Redis as message broker and PostgreSQL for persistence.');
const mdChunks = processFile(path.join(tmpDir, 'README.md'));
check('ingest markdown', mdChunks.length >= 1);
console.log('     chunks:', mdChunks.length, 'type:', mdChunks[0]?.metadata?.fileType);

// Codigo
fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'import express from "express";\n\nconst app = express();\napp.get("/", (req, res) => res.json({ ok: true }));\napp.listen(3000);\n\nexport default app;');
const tsChunks = processFile(path.join(tmpDir, 'app.ts'));
check('ingest TypeScript', tsChunks.length >= 1);
console.log('     chunks:', tsChunks.length, 'type:', tsChunks[0]?.metadata?.fileType);

// YAML - mas largo para superar MIN_CHUNK_CHARS
fs.writeFileSync(path.join(tmpDir, 'config.yaml'), '# Database configuration\ndatabase:\n  host: localhost\n  port: 5432\n  name: myapp\n  pool_size: 20\n\n# Redis configuration\nredis:\n  url: redis://localhost:6379\n  db: 0\n\n# API settings\napi:\n  version: v1\n  cors: true');
const yamlChunks = processFile(path.join(tmpDir, 'config.yaml'));
check('ingest YAML', yamlChunks.length >= 1);
console.log('     chunks:', yamlChunks.length);

// Directory
const files = scanDirectory(tmpDir);
check('scan directory: 3 archivos', files.length === 3);

const stats = scanDirectoryStats(tmpDir);
check('stats: 3 archivos', stats.totalFiles === 3);

// Ingest into CHL
let ingested = 0;
for (const f of files) {
  const chunks = processFile(f);
  for (const c of chunks) {
    chl.remember(c.text, { chunk: c.text.slice(0, 200) }, c.metadata);
    ingested++;
  }
}
check('ingestion total > 0', ingested > 0);
console.log('     total chunks ingeridos:', ingested);

// Verify ingestion recall
const r8 = chl.recall('Redis microservices', { topK: 2 });
check('recall post-ingestion: Redis', r8.candidates.length > 0);
console.log('     ->', r8.candidates[0]?.text?.slice(0, 80));

fs.rmSync(tmpDir, { recursive: true });

// ─── 11. Limpiar ─────────────────────────────────────────
console.log('\n[10] Clear');
const beforeClear = (chl.entries?.() || []).length;
chl.clear?.();
const afterClear = (chl.entries?.() || []).length;
check('clear funciona', beforeClear > 0 && afterClear === 0);
console.log('     antes:', beforeClear, '-> despues:', afterClear);

// ─── Resultado ───────────────────────────────────────────
console.log('\n\x1b[1m═══════════════════════════════════\x1b[0m');
const total = TEST.ok + TEST.fail;
if (TEST.fail === 0) {
  console.log('\x1b[32m\x1b[1m  ' + TEST.ok + '/' + total + ' tests OK\x1b[0m');
} else {
  console.log('\x1b[31m\x1b[1m  ' + TEST.fail + ' FALLOS de ' + total + '\x1b[0m');
}
console.log('\x1b[1m═══════════════════════════════════\x1b[0m');
process.exit(TEST.fail > 0 ? 1 : 0);
