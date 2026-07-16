import fs from 'node:fs';
import { config, MODELS_CACHE_FILE } from '../config.js';
import { getApiKey } from '../core/settings.js';

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_TTL_MS = 6 * 60 * 60 * 1000; // refresh the free-model list every 6h
const COOLDOWN_MS = 5 * 60 * 1000; // a model that just failed gets skipped for 5 min
const MAX_ATTEMPTS = 6;

function isFree(model) {
  const p = model?.pricing || {};
  return model.id?.endsWith(':free') || (Number(p.prompt) === 0 && Number(p.completion) === 0);
}

function loadCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(MODELS_CACHE_FILE, 'utf8'));
    if (Date.now() - raw.fetchedAt < MODELS_TTL_MS && Array.isArray(raw.models) && raw.models.length) {
      return raw.models;
    }
  } catch {
    // no cache yet or unreadable, fall through
  }
  return null;
}

function saveCache(models) {
  fs.writeFileSync(MODELS_CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), models }, null, 2));
}

export class OpenRouterClient {
  constructor() {
    this.cooldowns = new Map(); // modelId -> expiresAt timestamp
  }

  headers() {
    return {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.openrouterSiteUrl,
      'X-Title': config.openrouterAppName,
    };
  }

  /** Live list of the currently free (":free") OpenRouter models, ranked by context length. */
  async freeModels({ forceRefresh = false } = {}) {
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) return cached;
    }
    const res = await fetch(MODELS_URL, { headers: this.headers() });
    if (!res.ok) {
      const cached = loadCache();
      if (cached) return cached; // serve stale cache rather than fail outright
      throw new Error(`Failed to fetch OpenRouter model list: ${res.status}`);
    }
    const body = await res.json();
    const free = (body.data || [])
      .filter(isFree)
      .sort((a, b) => (b.context_length || 0) - (a.context_length || 0))
      .map((m) => ({ id: m.id, context_length: m.context_length || 0, name: m.name }));
    if (free.length) saveCache(free);
    return free.length ? free : loadCache() || [];
  }

  isCoolingDown(modelId) {
    const until = this.cooldowns.get(modelId);
    return typeof until === 'number' && until > Date.now();
  }

  markFailed(modelId) {
    this.cooldowns.set(modelId, Date.now() + COOLDOWN_MS);
  }

  /**
   * Send a chat completion, rotating across free OpenRouter models on rate limit/errors.
   * Returns { content, model }.
   */
  async chat(messages, { temperature = 0.4, maxTokens = 700 } = {}) {
    if (!getApiKey()) {
      throw new Error('No OpenRouter API key configured yet. Add one in the web UI setup screen.');
    }
    const models = await this.freeModels();
    if (!models.length) throw new Error('No free OpenRouter models available right now.');

    const candidates = models.filter((m) => !this.isCoolingDown(m.id));
    const pool = (candidates.length ? candidates : models).slice(0, MAX_ATTEMPTS);

    let lastError;
    for (const model of pool) {
      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model: model.id,
            messages,
            temperature,
            max_tokens: maxTokens,
          }),
        });

        if (!res.ok) {
          this.markFailed(model.id);
          lastError = new Error(`${model.id} responded ${res.status}: ${await res.text().catch(() => '')}`);
          continue;
        }

        const body = await res.json();
        const content = body?.choices?.[0]?.message?.content?.trim();
        if (!content) {
          this.markFailed(model.id);
          lastError = new Error(`${model.id} returned an empty completion`);
          continue;
        }
        return { content, model: model.id };
      } catch (err) {
        this.markFailed(model.id);
        lastError = err;
      }
    }
    throw new Error(`All free models failed. Last error: ${lastError?.message || 'unknown'}`);
  }

  /** Convenience wrapper for prompts that expect a strict JSON reply. Retries once on parse failure. */
  async chatJSON(messages, opts = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { content, model } = await this.chat(messages, opts);
      const cleaned = content.replace(/^```json\s*|^```\s*|```$/gim, '').trim();
      try {
        return { json: JSON.parse(cleaned), model };
      } catch {
        messages = [...messages, { role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON object.' }];
      }
    }
    throw new Error('Model did not return valid JSON after retry.');
  }

  async simpleCompletion(messages, opts = {}) {
    const { content } = await this.chat(messages, opts);
    return content.replace(/^unknown$/im, '').trim();
  }
}

export const openrouter = new OpenRouterClient();
