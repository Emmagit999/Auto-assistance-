import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from '../config.js';
import { handleMessage } from '../core/brain.js';
import { listSnippets, getSession, createChat, listChats, getStats } from '../core/storage.js';
import { getApiKey, setApiKey, isConfigured, getWhatsAppSettings, setWhatsAppMode, setGroupAllowed, setTriggerSettings } from '../core/settings.js';
import { openrouter } from '../ai/openrouter.js';
import { whatsapp } from '../whatsapp/bot.js';
import { startPractice, submitPractice } from '../core/practice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startWebServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, 'public')));

  // --- chat ---

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

  app.get('/api/history', (req, res) => {
    const { sessionId } = req.query;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    const session = getSession(`web:${sessionId}`);
    res.json({ history: session.history, lastLanguage: session.lastLanguage, practice: session.practice });
  });

  // --- multi-chat ("New chat") ---

  app.get('/api/chats', (req, res) => {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    const chats = listChats(clientId).map((c) => ({ ...c, id: c.id.replace(/^web:/, '') }));
    res.json({ chats });
  });

  app.post('/api/chats', (req, res) => {
    const { clientId } = req.body || {};
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    const id = crypto.randomUUID();
    createChat(clientId, `web:${id}`);
    res.json({ id });
  });

  // --- setup (OpenRouter key) ---

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

  // --- usage dashboard ---

  app.get('/api/stats', (req, res) => {
    res.json(getStats());
  });

  // --- WhatsApp: pairing (QR or phone code), mode, group opt-in ---

  app.get('/api/whatsapp/status', (req, res) => {
    res.json(whatsapp.status());
  });

  app.post('/api/whatsapp/connect', async (req, res) => {
    const { method, phoneNumber } = req.body || {};
    if (!['qr', 'pairing'].includes(method)) return res.status(400).json({ error: 'method must be "qr" or "pairing"' });
    if (method === 'pairing' && !phoneNumber) return res.status(400).json({ error: 'phoneNumber is required for pairing' });
    const status = await whatsapp.start({ method, phoneNumber });
    res.json(status);
  });

  app.post('/api/whatsapp/logout', async (req, res) => {
    await whatsapp.logout();
    res.json({ ok: true });
  });

  app.get('/api/whatsapp/settings', (req, res) => {
    res.json(getWhatsAppSettings());
  });

  app.post('/api/whatsapp/settings', (req, res) => {
    const { mode, requireTrigger, triggerPrefix } = req.body || {};
    if (mode !== undefined) {
      if (!['self', 'dedicated'].includes(mode)) return res.status(400).json({ error: 'mode must be "self" or "dedicated"' });
      setWhatsAppMode(mode);
    }
    if (requireTrigger !== undefined || triggerPrefix !== undefined) {
      setTriggerSettings({ requireTrigger, triggerPrefix });
    }
    res.json(getWhatsAppSettings());
  });

  app.post('/api/whatsapp/groups', (req, res) => {
    const { groupJid, allowed } = req.body || {};
    if (!groupJid) return res.status(400).json({ error: 'groupJid is required' });
    setGroupAllowed(groupJid, Boolean(allowed));
    res.json(getWhatsAppSettings());
  });

  // --- practice mode ---

  app.post('/api/practice/start', async (req, res) => {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    try {
      const challenge = await startPractice(`web:${sessionId}`);
      res.json({ challenge });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/practice/submit', async (req, res) => {
    const { sessionId, code } = req.body || {};
    if (!sessionId || typeof code !== 'string') return res.status(400).json({ error: 'sessionId and code are required' });
    try {
      const { result, feedback } = await submitPractice(`web:${sessionId}`, code);
      res.json({ result, feedback });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.listen(config.webPort, () => {
    console.log(`Web UI: http://localhost:${config.webPort}`);
  });
}
