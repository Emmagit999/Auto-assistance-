import { spawn } from 'node:child_process';
import { LANGUAGES } from '../config.js';

function tryRun(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function isRuntimeAvailable(language) {
  const def = LANGUAGES[language];
  if (!def) return false;
  const [cmd, args] = def.checkCmd;
  return tryRun(cmd, args);
}

/** Which package-manager binary this box uses: Termux's `pkg`, or plain `apt-get` elsewhere. */
export async function detectPackageManager() {
  if (await tryRun('pkg', ['--version'])) return 'pkg';
  if (await tryRun('apt-get', ['--version'])) return 'apt-get';
  if (await tryRun('apt', ['--version'])) return 'apt';
  return null;
}
