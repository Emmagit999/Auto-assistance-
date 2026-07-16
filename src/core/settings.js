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
