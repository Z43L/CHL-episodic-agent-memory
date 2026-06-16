// ollama_adapter.js
// Express server that mimics Ollama API and forwards to CHL bridge

const express = require('express');
const bodyParser = require('body-parser');
// Import helper functions from the bridge adapter (to be added)
const { handleOllamaGenerate, handleOllamaChat, getModelTags } = require('./src/bridge/model-adapter');

const app = express();
app.use(bodyParser.json({ limit: '5mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

// Tags endpoint – returns list of model tags in Ollama format
app.get('/api/tags', (req, res) => {
  const tags = getModelTags();
  // Ollama expects an object with a "models" array
  res.json({ models: tags.map(tag => ({ name: tag, modified_at: new Date().toISOString(), size: 0, digest: '' })) });
});

// Generate endpoint – forwards to CHL bridge generate
app.post('/api/generate', async (req, res) => {
  try {
    const result = await handleOllamaGenerate(req.body);
    res.json(result);
  } catch (e) {
    console.error('Generate error', e);
    res.status(500).json({ error: e.message });
  }
});

// Chat endpoint – forwards to CHL bridge chat
app.post('/api/chat', async (req, res) => {
  try {
    const result = await handleOllamaChat(req.body);
    res.json(result);
  } catch (e) {
    console.error('Chat error', e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 33141;
app.listen(PORT, () => {
  console.log(`Ollama‑compatible shim listening on port ${PORT}`);
});
