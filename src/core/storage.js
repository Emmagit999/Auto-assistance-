import fs from 'node:fs';
import crypto from 'node:crypto';
import { DB_FILE } from '../config.js';

const EMPTY_DB = { sessions: {}, snippets: [] };
const MAX_HISTORY = 12; // chat turns kept per session for AI context
const MAX_SNIPPETS = 500; // oldest are trimmed beyond this

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
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
    db.sessions[sessionId] = { id: sessionId, history: [], lastLanguage: null, createdAt: Date.now() };
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
  persist();
  return session;
}

export function setLastLanguage(sessionId, language) {
  const session = getSession(sessionId);
  session.lastLanguage = language;
  persist();
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
