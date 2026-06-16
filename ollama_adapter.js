// ollama_adapter.js
// Express server that mimics Ollama API and forwards to CHL bridge

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('node:fs');
const path = require('node:path');
const { createBridge } = require('./src/bridge/bridge');

// Read command line args or env variables
const args = process.argv.slice(2);
let memoryPath = process.env.CHL_PERSIST_PATH;

// Check if --memory arg is passed
const memoryArgIndex = args.indexOf('--memory');
if (memoryArgIndex !== -1 && args[memoryArgIndex + 1]) {
  memoryPath = args[memoryArgIndex + 1];
}

// Default memory path if not specified
if (!memoryPath) {
  memoryPath = path.resolve(__dirname, 'chl-memory-data', 'chl-memory.memory');
} else {
  memoryPath = path.resolve(memoryPath);
}

// Ensure it has .memory extension if it is intended to be a binary archive
if (!memoryPath.endsWith('.memory') && !memoryPath.endsWith('.log')) {
  // If it doesn't have an extension, default to .memory
  memoryPath += '.memory';
}

console.log(`[Shim] Initializing CHL Memory Bridge with database: ${memoryPath}`);

const provider = process.env.CHL_PROVIDER || 'ollama';
const modelName = process.env.CHL_MODEL || 'llama3';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

// Create a single shared bridge instance
const bridge = createBridge({
  provider: provider,
  model: modelName,
  baseURL: ollamaBaseUrl,
  persistPath: memoryPath,
});

// Wait for hydration
bridge.chl.whenReady().then(() => {
  const count = bridge.chl.entries().length;
  console.log(`[Shim] CHL Memory database is ready. loaded ${count} entries.`);
}).catch(err => {
  console.error('[Shim] Error initializing memory:', err);
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', persistPath: memoryPath });
});

// Tags endpoint – returns list of model tags in Ollama format
app.get('/api/tags', (req, res) => {
  const modelTag = modelName || 'chl-episodic-agent-memory';
  res.json({
    models: [
      {
        name: modelTag,
        modified_at: new Date().toISOString(),
        size: 0,
        digest: ''
      }
    ]
  });
});

// Generate endpoint – forwards to CHL bridge generate
app.post('/api/generate', async (req, res) => {
  const { prompt, stream } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt' });
  }

  try {
    // If the client requests streaming (which many Android apps do)
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      await bridge.turnStream(prompt, (chunk) => {
        const streamChunk = {
          model: modelName,
          created_at: new Date().toISOString(),
          response: chunk,
          done: false
        };
        res.write(JSON.stringify(streamChunk) + '\n');
      });

      // Send the final done chunk
      const doneChunk = {
        model: modelName,
        created_at: new Date().toISOString(),
        response: '',
        done: true
      };
      res.write(JSON.stringify(doneChunk) + '\n');
      res.end();
    } else {
      // Non-streaming response
      const result = await bridge.turn(prompt);
      res.json({
        model: modelName,
        created_at: new Date().toISOString(),
        response: result.response,
        done: true,
      });
    }
  } catch (e) {
    console.error('Generate error', e);
    res.status(500).json({ error: e.message });
  }
});

// Chat endpoint – forwards to CHL bridge chat
app.post('/api/chat', async (req, res) => {
  const { messages, stream } = req.body;
  const userMsg = messages?.reverse().find(m => m.role === 'user');
  const prompt = userMsg?.content || '';

  if (!prompt) {
    return res.status(400).json({ error: 'Missing user message' });
  }

  try {
    if (stream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');

      await bridge.turnStream(prompt, (chunk) => {
        const streamChunk = {
          model: modelName,
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: chunk
          },
          done: false
        };
        res.write(JSON.stringify(streamChunk) + '\n');
      });

      const doneChunk = {
        model: modelName,
        created_at: new Date().toISOString(),
        done: true
      };
      res.write(JSON.stringify(doneChunk) + '\n');
      res.end();
    } else {
      const result = await bridge.turn(prompt);
      res.json({
        model: modelName,
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: result.response
        },
        done: true,
      });
    }
  } catch (e) {
    console.error('Chat error', e);
    res.status(500).json({ error: e.message });
  }
});

// Cleanup on exit
let isCleaningUp = false;
async function cleanup() {
  if (isCleaningUp) return;
  isCleaningUp = true;
  console.log('\n[Shim] Saving memory and closing bridge...');
  try {
    bridge.chl.saveLexicon?.();
  } catch {}
  await bridge.close();
  console.log('[Shim] Done. Goodbye!');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

const PORT = process.env.PORT || 33141;
// Listen on 0.0.0.0 explicitly to allow external devices (like Android apps) to connect
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Ollama‑compatible shim listening on http://0.0.0.0:${PORT}`);
});
