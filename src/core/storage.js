import fs from 'node:fs';
import crypto from 'node:crypto';
import { DB_FILE } from '../config.js';

const EMPTY_DB = {
  sessions: {}, // chat threads: WhatsApp JIDs and web chat ids alike
  snippets: [],
  clients: {}, // browser identities -> which chat threads belong to them
  stats: { totalMessages: 0, totalSnippetsRun: 0, runsSucceeded: 0, runsFailed: 0, charsDelivered: 0, languageCounts: {} },
  dailyActivity: {}, // 'YYYY-MM-DD' -> { messages, snippetsRun }
};
const MAX_HISTORY = 12; // chat turns kept per session for AI context
const MAX_SNIPPETS = 500; // oldest are trimmed beyond this

function load() {
  try {
    const onDisk = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...structuredClone(EMPTY_DB), ...onDisk }; // fills in any keys missing from an older db.json
  } catch {
    return structuredClone(EMPTY_DB);
  }
}

let db = load();

function persist() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

export function getSession(sessionId) {
  if (!db.sessions[sessionId]) {
    db.sessions[sessionId] = {
      id: sessionId,
      history: [],
      lastLanguage: null,
      title: null,
      practice: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    persist();
  }
  return db.sessions[sessionId];
}

export function pushHistory(sessionId, role, content) {
  const session = getSession(sessionId);
  session.history.push({ role, content, at: Date.now() });
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }
  session.updatedAt = Date.now();
  if (!session.title && role === 'user') {
    session.title = content.trim().slice(0, 40) || 'Chat';
  }
  persist();
  return session;
}

export function setLastLanguage(sessionId, language) {
  const session = getSession(sessionId);
  session.lastLanguage = language;
  persist();
}

export function setPracticeChallenge(sessionId, challenge) {
  const session = getSession(sessionId);
  session.practice = challenge ? { ...challenge, startedAt: Date.now() } : null;
  persist();
  return session;
}

export function saveSnippet({ sessionId, language, code, channel }) {
  const snippet = {
    id: crypto.randomUUID(),
    sessionId,
    language,
    code,
    channel,
    savedAt: Date.now(),
  };
  db.snippets.push(snippet);
  if (db.snippets.length > MAX_SNIPPETS) {
    db.snippets = db.snippets.slice(-MAX_SNIPPETS);
  }
  persist();
  return snippet;
}

export function listSnippets(sessionId, limit = 20) {
  return db.snippets
    .filter((s) => s.sessionId === sessionId)
    .slice(-limit)
    .reverse();
}

// --- multi-chat (web UI "new chat" support) ---
// A "client" is a stable per-browser id (kept in localStorage); it owns a list of chat
// thread ids so the UI can list/switch between separate conversations.

export function getOrCreateClient(clientId) {
  if (!db.clients[clientId]) {
    db.clients[clientId] = { id: clientId, chatIds: [], createdAt: Date.now() };
    persist();
  }
  return db.clients[clientId];
}

export function createChat(clientId, chatId) {
  const client = getOrCreateClient(clientId);
  getSession(chatId); // ensures the session row exists
  if (!client.chatIds.includes(chatId)) {
    client.chatIds.unshift(chatId);
    persist();
  }
  return chatId;
}

export function listChats(clientId) {
  const client = db.clients[clientId];
  if (!client) return [];
  return client.chatIds
    .map((id) => db.sessions[id])
    .filter(Boolean)
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
    .map((s) => ({
      id: s.id,
      title: s.title || 'New chat',
      updatedAt: s.updatedAt || s.createdAt,
      lastLanguage: s.lastLanguage,
      messageCount: s.history.length,
    }));
}

// --- usage stats (the web UI dashboard) ---

function bumpDaily(key) {
  const day = new Date().toISOString().slice(0, 10);
  db.dailyActivity[day] = db.dailyActivity[day] || { messages: 0, snippetsRun: 0 };
  db.dailyActivity[day][key] += 1;
}

export function recordMessage() {
  db.stats.totalMessages += 1;
  bumpDaily('messages');
  persist();
}

export function recordSnippetRun(language, success) {
  db.stats.totalSnippetsRun += 1;
  db.stats.languageCounts[language] = (db.stats.languageCounts[language] || 0) + 1;
  db.stats[success ? 'runsSucceeded' : 'runsFailed'] += 1;
  bumpDaily('snippetsRun');
  persist();
}

export function recordCharsDelivered(n) {
  if (!n) return;
  db.stats.charsDelivered += n;
  persist();
}

export function getStats() {
  return { ...db.stats, dailyActivity: db.dailyActivity };
}
