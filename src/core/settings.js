import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

let settings = load();

function persist() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

/**
 * Where the OpenRouter key actually lives at runtime. The web UI setup screen is the
 * primary way to set it (POST /api/setup) so nobody's personal key ever has to be
 * hardcoded or committed; an OPENROUTER_API_KEY env var still works as a headless fallback.
 */
export function getApiKey() {
  return settings.openrouterApiKey || process.env.OPENROUTER_API_KEY || '';
}

export function setApiKey(key) {
  settings.openrouterApiKey = key;
  persist();
}

export function isConfigured() {
  return Boolean(getApiKey());
}

const DEFAULT_TRIGGER_PREFIX = '?';

/**
 * WhatsApp behavior. Defaults are deliberately strict:
 * - "self" mode: only ever replies when the linked account messages *itself* (the
 *   "Message Yourself" thread) — it never talks to your real contacts. Switch to
 *   "dedicated" mode if this number is a bot-only number meant to talk to anyone.
 * - allowedGroups: empty by default — the bot never replies in a group until its JID is
 *   explicitly added here.
 * - requireTrigger: on by default, like a normal WhatsApp/Discord-style bot -- a message
 *   only counts as "for the bot" if it starts with triggerPrefix (stripped before
 *   processing), so the bot doesn't respond to every single message in whatever
 *   thread/group it's allowed to see.
 */
export function getWhatsAppSettings() {
  return {
    mode: settings.whatsappMode === 'dedicated' ? 'dedicated' : 'self',
    allowedGroups: Array.isArray(settings.allowedGroups) ? settings.allowedGroups : [],
    requireTrigger: settings.requireTrigger !== false,
    triggerPrefix: settings.triggerPrefix || DEFAULT_TRIGGER_PREFIX,
  };
}

export function setWhatsAppMode(mode) {
  settings.whatsappMode = mode === 'dedicated' ? 'dedicated' : 'self';
  persist();
}

export function setGroupAllowed(groupJid, allowed) {
  const groups = new Set(Array.isArray(settings.allowedGroups) ? settings.allowedGroups : []);
  if (allowed) groups.add(groupJid);
  else groups.delete(groupJid);
  settings.allowedGroups = [...groups];
  persist();
}

export function setTriggerSettings({ requireTrigger, triggerPrefix }) {
  if (typeof requireTrigger === 'boolean') settings.requireTrigger = requireTrigger;
  if (typeof triggerPrefix === 'string' && triggerPrefix.trim()) settings.triggerPrefix = triggerPrefix.trim();
  persist();
}
