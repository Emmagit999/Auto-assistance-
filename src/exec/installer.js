import { spawn } from 'node:child_process';
import { LANGUAGES } from '../config.js';
import { isRuntimeAvailable, detectPackageManager } from './envCheck.js';
import { webSearch, formatResultsForPrompt } from '../search/duckduckgo.js';
import { openrouter } from '../ai/openrouter.js';
import { INSTALL_PKG_SYSTEM, installPkgUserPrompt } from '../ai/prompts.js';

// A package name must be a single safe token — this is the hard boundary that keeps an
// AI- or search-derived string from ever reaching a shell. We never build shell strings;
// spawn() below is always called with an argv array, but we still validate defensively.
const SAFE_PKG_RE = /^[a-zA-Z0-9][a-zA-Z0-9+._-]{0,63}$/;

function runCommand(cmd, args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: stderr + '\n' + err.message, code: -1 });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
}

async function findPackageNameViaSearch(language) {
  const results = await webSearch(`install ${language} termux pkg`, { limit: 5 });
  const snippets = formatResultsForPrompt(results);
  const pkg = await openrouter.simpleCompletion([
    { role: 'system', content: INSTALL_PKG_SYSTEM },
    { role: 'user', content: installPkgUserPrompt({ language, searchSnippets: snippets }) },
  ]);
  return { pkg: pkg.trim(), results };
}

/**
 * Make sure a language runtime is installed, installing it via the system package
 * manager if it's missing. Returns { alreadyInstalled, installed, pkg, log, error }.
 */
export async function ensureRuntime(language) {
  if (await isRuntimeAvailable(language)) {
    return { alreadyInstalled: true, installed: true };
  }

  const def = LANGUAGES[language];
  let pkg = def?.pkg;
  let searchedResults = null;

  if (!pkg) {
    const found = await findPackageNameViaSearch(language);
    pkg = found.pkg;
    searchedResults = found.results;
  }

  if (!pkg || pkg.toLowerCase() === 'unknown' || !SAFE_PKG_RE.test(pkg)) {
    return {
      alreadyInstalled: false,
      installed: false,
      error: `Could not determine a safe package name to install "${language}".`,
      searchedResults,
    };
  }

  const pm = await detectPackageManager();
  if (!pm) {
    return { alreadyInstalled: false, installed: false, error: 'No supported package manager (pkg/apt-get/apt) found on this system.' };
  }

  const args = pm === 'pkg' ? ['install', '-y', pkg] : ['install', '-y', pkg];
  const result = await runCommand(pm, args, { timeoutMs: 180_000 });

  return {
    alreadyInstalled: false,
    installed: result.ok,
    pkg,
    pm,
    log: `${result.stdout}\n${result.stderr}`.trim().slice(-4000),
    error: result.ok ? null : `${pm} install ${pkg} exited with code ${result.code}`,
  };
}
