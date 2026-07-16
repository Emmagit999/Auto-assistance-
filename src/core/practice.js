import { openrouter } from '../ai/openrouter.js';
import { PRACTICE_CHALLENGE_SYSTEM, practiceChallengeUserPrompt, PRACTICE_GRADE_SYSTEM, practiceGradeUserPrompt } from '../ai/prompts.js';
import { getSession, setPracticeChallenge, listSnippets, recordSnippetRun } from './storage.js';
import { isRuntimeAvailable } from '../exec/envCheck.js';
import { ensureRuntime } from '../exec/installer.js';
import { runCode } from '../exec/runner.js';

function languageCounts(snippets) {
  const counts = {};
  for (const s of snippets) counts[s.language] = (counts[s.language] || 0) + 1;
  return counts;
}

/** Generates a live-coding challenge based on this session's own snippet history. */
export async function startPractice(sessionId) {
  const snippets = listSnippets(sessionId, 15).filter((s) => s.language && s.language !== 'unknown');
  const counts = languageCounts(snippets);
  const recent =
    snippets
      .slice(0, 5)
      .map((s) => `[${s.language}]\n${s.code}`)
      .join('\n\n') || '(no history yet — pick a beginner-friendly Python exercise)';

  const { json } = await openrouter.chatJSON([
    { role: 'system', content: PRACTICE_CHALLENGE_SYSTEM },
    { role: 'user', content: practiceChallengeUserPrompt({ languageCounts: counts, recentSnippets: recent }) },
  ]);

  const challenge = {
    language: json.language,
    title: json.title,
    prompt: json.prompt,
    starterCode: json.starter_code || '',
  };
  setPracticeChallenge(sessionId, challenge);
  return challenge;
}

/** Runs the user's attempt against the active challenge and has AI grade it. */
export async function submitPractice(sessionId, code) {
  const session = getSession(sessionId);
  const challenge = session.practice;
  if (!challenge) throw new Error('No practice challenge in progress for this session.');

  const { language } = challenge;
  if (!(await isRuntimeAvailable(language))) {
    const ensure = await ensureRuntime(language);
    if (!ensure.installed) throw new Error(`Couldn't install ${language} to run this: ${ensure.error}`);
  }

  const result = await runCode(sessionId, language, code);
  recordSnippetRun(language, result.exitCode === 0 && !result.timedOut);

  const feedback = await openrouter.simpleCompletion([
    { role: 'system', content: PRACTICE_GRADE_SYSTEM },
    {
      role: 'user',
      content: practiceGradeUserPrompt({
        challenge,
        code,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }),
    },
  ]);

  setPracticeChallenge(sessionId, null);
  return { result, feedback };
}
