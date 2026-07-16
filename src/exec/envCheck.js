import { spawn } from 'node:child_process';
import { LANGUAGES } from '../config.js';

function tryRun(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

// Checks PATH directly via the shell's `command -v` builtin rather than invoking each
// interpreter with a guessed "--version"-style flag — flag conventions vary wildly across
// ~30 languages (some want -v, some -version, some none at all) and a wrong guess would
// falsely report an installed runtime as missing. `command -v` only needs the binary name.
function isOnPath(bin) {
  return tryRun('sh', ['-c', `command -v ${bin}`]);
}

export async function isRuntimeAvailable(language) {
  const def = LANGUAGES[language];
  if (!def) return false;
  return isOnPath(def.bin);
}

/** Which package-manager binary this box uses: Termux's `pkg`, or plain `apt-get` elsewhere. */
export async function detectPackageManager() {
  if (await isOnPath('pkg')) return 'pkg';
  if (await isOnPath('apt-get')) return 'apt-get';
  if (await isOnPath('apt')) return 'apt';
  return null;
}
