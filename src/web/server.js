import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from '../config.js';
import { handleMessage } from '../core/brain.js';
import { listSnippets } from '../core/storage.js';
import { getApiKey, setApiKey, isConfigured } from '../core/settings.js';
import { openrouter } from '../ai/openrouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startWebServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.post('/api/chat', async (req, res) => {
    const { sessionId, message } = req.body || {};
    if (!sessionId || typeof message !== 'string') {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }
    try {
      const messages = await handleMessage(`web:${sessionId}`, message, 'web');
      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/setup/status', (req, res) => {
    res.json({ configured: isConfigured() });
  });

  app.post('/api/setup', async (req, res) => {
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'apiKey is required' });
    }
    const previous = getApiKey();
    setApiKey(apiKey.trim());
    try {
      // Real round-trip against OpenRouter so a bad/expired key is rejected immediately
      // instead of silently failing on the user's first real chat message.
      await openrouter.chat([{ role: 'user', content: 'Reply with just: ok' }], { maxTokens: 5 });
      res.json({ ok: true });
    } catch (err) {
      setApiKey(previous);
      res.status(400).json({ error: `That key didn't work: ${err.message}` });
    }
  });

  app.get('/api/snippets', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    res.json({ snippets: listSnippets(`web:${sessionId}`) });
  });

  app.listen(config.webPort, () => {
    console.log(`Web UI: http://localhost:${config.webPort}`);
  });
}
