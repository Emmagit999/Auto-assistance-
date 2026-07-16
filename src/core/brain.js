import { detectCode } from './codeDetect.js';
import { getSession, pushHistory, setLastLanguage, saveSnippet, recordMessage, recordSnippetRun, recordCharsDelivered } from './storage.js';
import { isConfigured } from './settings.js';
import { isRuntimeAvailable } from '../exec/envCheck.js';
import { ensureRuntime } from '../exec/installer.js';
import { runCode } from '../exec/runner.js';
import { openrouter } from '../ai/openrouter.js';
import { CHAT_SYSTEM, EXPLAIN_SYSTEM, explainResultUserPrompt } from '../ai/prompts.js';
import { config } from '../config.js';

const OUTPUT_CHAR_LIMIT = 3500;

function truncate(text, limit = OUTPUT_CHAR_LIMIT) {
  if (!text) return '(empty)';
  return text.length > limit ? `${text.slice(0, limit)}\n… (truncated)` : text;
}

function formatOutput(result) {
  const status = result.timedOut ? '⏱️ timed out' : result.exitCode === 0 ? '✅ success' : `❌ exit code ${result.exitCode}`;
  return [
    `Result: ${status}`,
    result.stdout?.trim() ? `STDOUT:\n${truncate(result.stdout.trim())}` : null,
    result.stderr?.trim() ? `STDERR:\n${truncate(result.stderr.trim())}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function chatReply(sessionId) {
  const session = getSession(sessionId);
  const history = session.history.slice(-10).map((h) => ({ role: h.role, content: h.content }));
  try {
    const reply = await openrouter.simpleCompletion([{ role: 'system', content: CHAT_SYSTEM }, ...history]);
    return reply;
  } catch (err) {
    return `I couldn't reach an AI model right now (${err.message}). Paste code any time and I'll still save/run it.`;
  }
}

/**
 * Handle one inbound message for a session (a WhatsApp JID or a web session id).
 * Returns an array of strings to send back, in order (status updates, then result).
 */
export async function handleMessage(sessionId, rawText, channel = 'web') {
  const text = String(rawText ?? '').trim();
  if (!text) return [];

  if (!isConfigured()) {
    return [
      `🔑 I need an OpenRouter API key before I can help. Open the Androg web UI ` +
        `(http://<this-device-ip>:${config.webPort}) and paste a free key from ` +
        `https://openrouter.ai/keys to finish setup — it only takes a minute.`,
    ];
  }

  recordMessage();
  pushHistory(sessionId, 'user', text);
  const messages = [];

  const detection = await detectCode(text);

  if (!detection.isCode) {
    const reply = await chatReply(sessionId);
    pushHistory(sessionId, 'assistant', reply);
    recordCharsDelivered(reply.length);
    return [reply];
  }

  if (!detection.language) {
    const reply =
      "That looks like code, but I couldn't tell what language it's in, so I saved it without running it. " +
      'Try telling me the language (e.g. put ```python at the top of the block).';
    saveSnippet({ sessionId, language: 'unknown', code: detection.code, channel });
    pushHistory(sessionId, 'assistant', reply);
    recordCharsDelivered(reply.length);
    return [reply];
  }

  const { language, code } = detection;
  saveSnippet({ sessionId, language, code, channel });
  setLastLanguage(sessionId, language);
  messages.push(`💾 Saved your ${language} snippet.`);

  const available = await isRuntimeAvailable(language);
  if (!available) {
    messages.push(`🔧 ${language} isn't installed here yet — searching for setup steps and installing it...`);
    const ensure = await ensureRuntime(language);
    if (!ensure.installed) {
      const failMsg = `❌ Couldn't install ${language} automatically: ${ensure.error}`;
      messages.push(failMsg);
      const combinedFail = messages.join('\n\n');
      pushHistory(sessionId, 'assistant', combinedFail);
      recordCharsDelivered(combinedFail.length);
      return messages;
    }
    messages.push(`✅ Installed ${language}${ensure.pkg ? ` (package: ${ensure.pkg})` : ''}.`);
  }

  messages.push(`▶️ Running your ${language} code...`);
  const result = await runCode(sessionId, language, code);
  recordSnippetRun(language, result.exitCode === 0 && !result.timedOut);
  messages.push(formatOutput(result));

  try {
    const explanation = await openrouter.simpleCompletion([
      { role: 'system', content: EXPLAIN_SYSTEM },
      {
        role: 'user',
        content: explainResultUserPrompt({
          language,
          code,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode ?? result.code,
          timedOut: result.timedOut,
          phase: result.phase,
        }),
      },
    ]);
    messages.push(`🤖 ${explanation}`);
  } catch {
    // AI explanation is best-effort; the raw output above already answers the request.
  }

  const combined = messages.join('\n\n');
  pushHistory(sessionId, 'assistant', combined);
  recordCharsDelivered(combined.length);
  return messages;
}
