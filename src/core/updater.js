import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..'); // src/core -> project root

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function run(cmd) {
  return execAsync(cmd, { cwd: ROOT });
}

export async function isGitRepo() {
  try {
    await run('git rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

function restartSelf() {
  const child = spawn(process.argv[0], process.argv.slice(1), {
    cwd: ROOT,
    detached: true,
    stdio: 'inherit',
  });
  child.unref();
  process.exit(0);
}

async function checkAndApply() {
  try {
    await run('git fetch origin --quiet');
    const [{ stdout: local }, { stdout: remote }] = await Promise.all([run('git rev-parse HEAD'), run('git rev-parse origin/main')]);
    if (local.trim() === remote.trim()) return; // already up to date

    console.log('⬇️  Update available, pulling...');
    const { stdout: changedRaw } = await run('git diff --name-only HEAD origin/main');
    const changed = changedRaw.split('\n').filter(Boolean);

    await run('git pull --ff-only origin main');

    if (changed.includes('package.json') || changed.includes('package-lock.json')) {
      console.log('📦 Dependencies changed, running npm install...');
      await run('npm install');
    }

    console.log('🔁 Update applied, restarting...');
    restartSelf();
  } catch (err) {
    console.warn('Auto-update check failed (will retry next cycle):', err.message);
  }
}

/** Polls the git remote every 5 minutes; pulls, reinstalls if needed, and restarts
 * itself in place when a new commit lands. No-ops if this isn't a git checkout. */
export function startAutoUpdateLoop() {
  isGitRepo().then((yes) => {
    if (!yes) {
      console.log('Auto-update disabled: not running from a git checkout.');
      return;
    }
    console.log('🔄 Auto-update: checking for new versions every 5 minutes.');
    setInterval(checkAndApply, CHECK_INTERVAL_MS);
  });
}
