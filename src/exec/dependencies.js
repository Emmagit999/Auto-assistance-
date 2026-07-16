import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// A package name here always comes from OUR OWN regex extraction of the interpreter's
// own error message (never straight from AI or arbitrary text), further constrained by
// this pattern, and is invoked via spawn() with an argv array -- never a shell -- the
// same safety pattern used by the language-runtime installer.
const SAFE_PACKAGE_RE = /^[a-zA-Z0-9@][a-zA-Z0-9@_./-]{0,100}$/;

// Only wired up for languages with a single well-defined "missing package" error format
// and a single-command installer. Easy to extend: add a regex (first capture group is
// the package name) and an install() spawn spec.
const MISSING_PACKAGE_RULES = {
  python: {
    regex: /ModuleNotFoundError: No module named '([\w.-]+)'/,
    // `python3 -m pip` (not a bare `pip`/`pip3` binary) avoids PATH ambiguity between
    // multiple installed Python versions -- it always installs into whichever python3
    // is actually running the code.
    install: (pkg) => ({ cmd: 'python3', args: ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', pkg] }),
  },
  javascript: {
    regex: /Cannot find module '([^'\s]+)'/,
    install: (pkg) => ({ cmd: 'npm', args: ['install', '--no-audit', '--no-fund', '--silent', pkg] }),
  },
};

export function supportsAutoInstall(language) {
  return Boolean(MISSING_PACKAGE_RULES[language]);
}

/** Pulls a missing-package name out of a failed run's stderr, or null if this language
 * isn't wired up / the error doesn't look like a missing-package error. */
export function detectMissingPackage(language, stderr) {
  const rule = MISSING_PACKAGE_RULES[language];
  if (!rule || !stderr) return null;
  const match = stderr.match(rule.regex);
  const pkg = match?.[1];
  return pkg && SAFE_PACKAGE_RE.test(pkg) ? pkg : null;
}

function runCommand(cmd, args, cwd, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stderr: stderr + '\n' + err.message });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr });
    });
  });
}

/** Installs a missing package for `language` in `cwd` (so JS's local node_modules lands
 * where the retry will actually look for it). Returns { ok, error }. */
export async function installMissingPackage(language, pkg, cwd) {
  const rule = MISSING_PACKAGE_RULES[language];
  if (!rule) return { ok: false, error: `No package installer wired up for ${language}` };

  if (language === 'javascript') {
    // Without its own package.json, `npm install` walks UP the directory tree looking
    // for the nearest one -- which for a workspace dir with no package.json of its own
    // is this project's own package.json, silently adding the snippet's dependency to
    // Androg itself instead of installing it locally. A minimal package.json pins this
    // directory as npm's project root so the install stays isolated to the snippet.
    const pkgJsonPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(pkgJsonPath, JSON.stringify({ name: 'snippet', private: true }));
    }
  }

  const { cmd, args } = rule.install(pkg);
  const result = await runCommand(cmd, args, cwd);
  return { ok: result.ok, error: result.ok ? null : result.stderr.trim().slice(-800) };
}
