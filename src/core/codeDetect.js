import { resolveLanguage } from '../config.js';
import { openrouter } from '../ai/openrouter.js';
import { CODE_DETECT_SYSTEM, codeDetectUserPrompt } from '../ai/prompts.js';

const FENCE_RE = /```(\w+)?\r?\n([\s\S]*?)```/;

// Cheap keyword guesses so we don't have to hit the AI just to tag an obvious language.
const LANGUAGE_HINTS = [
  ['python', /\bdef \w+\(.*\):|\bimport \w+|print\(.*\)|elif |^\s*#!.*python/m],
  ['javascript', /\bfunction\b|=>|\bconst \w+ ?=|\blet \w+ ?=|console\.log/],
  ['java', /public\s+(static\s+)?class|System\.out\.println/],
  ['cpp', /#include\s*<\w+>|std::|cout\s*<</],
  ['c', /#include\s*<\w+\.h>|printf\(/],
  ['go', /package main|func main\(/],
  ['rust', /fn main\(|let mut |println!/],
  ['ruby', /\bend\b\s*$|puts |def \w+.*\n/],
  ['php', /<\?php/],
  ['bash', /^#!.*\b(bash|sh)\b|\bfi\b|\bdone\b|\$\(.*\)/m],
];

// Signals used to score plain (non-fenced) messages as "probably code" before
// spending an AI call to confirm — keeps normal chat fast and free.
const CODE_SIGNALS = [
  /[{};]/,
  /\bfunction\b|\bdef \b|\bclass \b|\bimport \b|#include/,
  /=>|::|->/,
  /^\s{2,}\S/m, // indentation
  /\bconsole\.log|print\(|System\.out|printf\(|puts /,
];

function guessLanguage(code) {
  for (const [lang, re] of LANGUAGE_HINTS) {
    if (re.test(code)) return lang;
  }
  return null;
}

function heuristicScore(text) {
  return CODE_SIGNALS.reduce((score, re) => score + (re.test(text) ? 1 : 0), 0);
}

/**
 * Detect whether a chat message contains code and, if so, extract it + its language.
 * Returns { isCode, language, code, confidence, source }.
 */
export async function detectCode(message) {
  const fenced = message.match(FENCE_RE);
  if (fenced) {
    const code = fenced[2].trim();
    const tagLanguage = resolveLanguage(fenced[1]);
    const language = tagLanguage || guessLanguage(code) || (await aiDetectLanguage(code));
    return { isCode: true, language, code, confidence: 0.95, source: 'fence' };
  }

  const score = heuristicScore(message);
  if (score < 2) {
    return { isCode: false, language: null, code: null, confidence: 1 - score / 5, source: 'heuristic' };
  }

  try {
    const { json } = await openrouter.chatJSON([
      { role: 'system', content: CODE_DETECT_SYSTEM },
      { role: 'user', content: codeDetectUserPrompt(message) },
    ]);
    if (json.is_code) {
      return {
        isCode: true,
        language: resolveLanguage(json.language) || guessLanguage(message),
        code: message.trim(),
        confidence: typeof json.confidence === 'number' ? json.confidence : 0.6,
        source: 'ai',
      };
    }
    return { isCode: false, language: null, code: null, confidence: json.confidence ?? 0.6, source: 'ai' };
  } catch {
    // AI unavailable: fall back to the heuristic-only guess rather than blocking the reply.
    const language = guessLanguage(message);
    return { isCode: Boolean(language), language, code: language ? message.trim() : null, confidence: 0.4, source: 'heuristic-fallback' };
  }
}

async function aiDetectLanguage(code) {
  try {
    const { json } = await openrouter.chatJSON([
      { role: 'system', content: CODE_DETECT_SYSTEM },
      { role: 'user', content: codeDetectUserPrompt(code) },
    ]);
    return resolveLanguage(json.language);
  } catch {
    return null;
  }
}
