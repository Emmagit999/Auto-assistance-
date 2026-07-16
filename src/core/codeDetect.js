import { resolveLanguage } from '../config.js';
import { openrouter } from '../ai/openrouter.js';
import { CODE_DETECT_SYSTEM, codeDetectUserPrompt } from '../ai/prompts.js';

const FENCE_RE = /```(\w+)?\r?\n([\s\S]*?)```/;

// Cheap keyword guesses so we don't have to hit the AI just to tag an obvious language.
// Only used as a fast-path for untagged fenced blocks / when the AI is unreachable --
// a fenced ```lang block or a live AI call (which now covers every LANGUAGES entry) is
// the authoritative path, so these don't need to be exhaustive or unambiguous.
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
  ['perl', /use strict|my \$\w+|print .*;|=~/],
  ['lua', /\blocal function\b|\blocal \w+ ?=|\bend\b\s*$|print\(/m],
  ['swift', /import Foundation|\bfunc \w+\(.*\)\s*(->|\{)|\bvar \w+\s*[:=]|\blet \w+\s*[:=]/],
  ['kotlin', /\bfun main\(|\bval \w+\s*[:=]|\bvar \w+\s*[:=]|println\(/],
  ['scala', /object \w+ extends|\bdef main\(|\bval \w+\s*=/],
  ['haskell', /^module \w+ where|::\s*\w+\s*->|^main\s*=/m],
  ['erlang', /^-module\(|^-export\(/m],
  ['elixir', /defmodule \w+|IO\.puts|\bdo\n/],
  ['dart', /void main\(\)|\bprint\(.*\);|import 'dart:/],
  ['csharp', /using System;|class \w+.*\{|static void Main/],
  ['tcl', /\bproc \w+\s*\{|\bset \w+\s+/],
  ['prolog', /:-\s*$|:-.*\./m],
  ['scheme', /\(define\s+\(|\(display\s+/],
  ['lisp', /\(defun\s+|\(format t\s+/],
  ['nim', /\bproc \w+\(.*\)\s*(:|\=)|echo /],
  ['zig', /const std = @import\("std"\)|pub fn main/],
  ['crystal', /puts .*|def \w+.*\n.*end/],
  ['groovy', /println\s|def \w+\s*=/],
  ['d', /import std\.|void main\(\)/],
  ['forth', /:\s+\w+\s+.*;/],
  ['octave', /^function\s+\w+|endfunction|disp\(/m],
];

// Signals used to score plain (non-fenced) messages as "probably code" before
// spending an AI call to confirm — keeps normal chat fast and free. Deliberately broad
// (covers print-family calls both with and without parens, semicolon-terminated lines,
// `use`/`my $`/`local`-style declarations, etc.) since a false negative here means real
// code silently falls through to plain chat instead of actually being run.
const CODE_SIGNALS = [
  /[{};]/,
  /;\s*$/m, // a line ending in a semicolon
  /\bfunction\b|\bdef \b|\bclass \b|\bimport \b|\buse \w|#include|\bmodule \w|\bdefmodule \b/,
  /=>|::|->|:-/,
  /^\s{2,}\S/m, // indentation
  /\b(console\.log|print|puts|echo|disp|println|IO\.puts|writeln)\b\s*[("]/,
  /\bmy \$\w+|\blocal \w+\s*=|\bval \w+\s*=|\bvar \w+\s*=|\blet \w+\s*=/,
  /\(define\s|\(display\s|\(defun\s/,
];

// Free/rotating models sometimes classify real code confidently but WRONGLY into one of
// our supported languages, because some genuinely unsupported languages share surface
// syntax with a supported one (OCaml/F#'s `let x = ... in` reads a lot like JS/Kotlin's
// `let`/`val`). Confidence scores don't help here -- a wrong guess can still come back at
// 0.95. Instead, check for syntax that's essentially never valid in any of our 32
// supported languages but is a strong tell for a specific unsupported one; if code
// clearly belongs to one of these, no AI opinion should be able to override that.
const UNSUPPORTED_LANGUAGE_SIGNALS = [
  // OCaml / F# (ML-family)
  /\bmatch\s+.+\s+with\b/,
  /\bSome\s*\(|\bNone\b.*->/,
  /\bfor\s+\w+\s*=\s*\d+\s+to\s+\d+\s+do\b/,
  /\blet\s+\(\)\s*=/,
  /^\s*\|\s*.+->/m,
  // COBOL
  /\bIDENTIFICATION DIVISION\b|\bPROCEDURE DIVISION\b/i,
  // Pascal / Delphi
  /\bprogram\s+\w+\s*;/i,
  /\bbegin\b[\s\S]*\bend\.\s*$/i,
];

function looksLikeUnsupportedLanguage(code) {
  return UNSUPPORTED_LANGUAGE_SIGNALS.filter((re) => re.test(code)).length >= 2;
}

function guessLanguage(code) {
  for (const [lang, re] of LANGUAGE_HINTS) {
    if (re.test(code)) return lang;
  }
  return null;
}

function heuristicScore(text) {
  return CODE_SIGNALS.reduce((score, re) => score + (re.test(text) ? 1 : 0), 0);
}

// Final gate applied no matter which path produced a language guess -- a supported-
// language answer never survives if the code itself carries strong unsupported-language
// tells (see looksLikeUnsupportedLanguage above).
function gateLanguage(language, code) {
  return language && looksLikeUnsupportedLanguage(code) ? null : language;
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
    const language = gateLanguage(tagLanguage || guessLanguage(code) || (await aiDetectLanguage(code)), code);
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
      const language = gateLanguage(resolveLanguage(json.language) || guessLanguage(message), message);
      return {
        isCode: true,
        language,
        code: message.trim(),
        confidence: typeof json.confidence === 'number' ? json.confidence : 0.6,
        source: 'ai',
      };
    }
    return { isCode: false, language: null, code: null, confidence: json.confidence ?? 0.6, source: 'ai' };
  } catch {
    // AI unavailable: fall back to the heuristic-only guess rather than blocking the reply.
    const language = gateLanguage(guessLanguage(message), message);
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
