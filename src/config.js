import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

export const DATA_DIR = path.join(ROOT, 'data');
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
export const AUTH_DIR = path.join(DATA_DIR, 'whatsapp-auth');
export const DB_FILE = path.join(DATA_DIR, 'db.json');
export const MODELS_CACHE_FILE = path.join(DATA_DIR, 'models_cache.json');

for (const dir of [DATA_DIR, WORKSPACE_DIR, AUTH_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const config = {
  openrouterSiteUrl: process.env.OPENROUTER_SITE_URL || 'https://github.com/',
  openrouterAppName: process.env.OPENROUTER_APP_NAME || 'Androg',
  webPort: Number(process.env.WEB_PORT || 3000),
  execTimeoutMs: Number(process.env.EXEC_TIMEOUT_SECONDS || 20) * 1000,
};

// Runtime map: how to detect, install (Termux/Debian package name) and run/compile
// each supported language. Kept as plain data so it's easy to extend.
export const LANGUAGES = {
  python: {
    aliases: ['python', 'python3', 'py'],
    ext: 'py',
    checkCmd: ['python3', ['--version']],
    pkg: 'python',
    run: (file) => ({ cmd: 'python3', args: [file] }),
  },
  javascript: {
    aliases: ['javascript', 'js', 'node', 'nodejs'],
    ext: 'js',
    checkCmd: ['node', ['--version']],
    pkg: 'nodejs',
    run: (file) => ({ cmd: 'node', args: [file] }),
  },
  bash: {
    aliases: ['bash', 'sh', 'shell'],
    ext: 'sh',
    checkCmd: ['bash', ['--version']],
    pkg: 'bash',
    run: (file) => ({ cmd: 'bash', args: [file] }),
  },
  c: {
    aliases: ['c'],
    ext: 'c',
    checkCmd: ['clang', ['--version']],
    pkg: 'clang',
    compile: (file, outFile) => ({ cmd: 'clang', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  cpp: {
    aliases: ['cpp', 'c++', 'cplusplus'],
    ext: 'cpp',
    checkCmd: ['clang++', ['--version']],
    pkg: 'clang',
    compile: (file, outFile) => ({ cmd: 'clang++', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  java: {
    aliases: ['java'],
    ext: 'java',
    checkCmd: ['javac', ['-version']],
    pkg: 'openjdk-17',
    compile: (file) => ({ cmd: 'javac', args: [file] }),
    run: (file, className) => ({ cmd: 'java', args: ['-cp', path.dirname(file), className] }),
  },
  go: {
    aliases: ['go', 'golang'],
    ext: 'go',
    checkCmd: ['go', ['version']],
    pkg: 'golang',
    run: (file) => ({ cmd: 'go', args: ['run', file] }),
  },
  rust: {
    aliases: ['rust', 'rs'],
    ext: 'rs',
    checkCmd: ['rustc', ['--version']],
    pkg: 'rust',
    compile: (file, outFile) => ({ cmd: 'rustc', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  ruby: {
    aliases: ['ruby', 'rb'],
    ext: 'rb',
    checkCmd: ['ruby', ['-v']],
    pkg: 'ruby',
    run: (file) => ({ cmd: 'ruby', args: [file] }),
  },
  php: {
    aliases: ['php'],
    ext: 'php',
    checkCmd: ['php', ['-v']],
    pkg: 'php',
    run: (file) => ({ cmd: 'php', args: [file] }),
  },
};

export function resolveLanguage(name) {
  if (!name) return null;
  const norm = String(name).trim().toLowerCase();
  for (const [key, def] of Object.entries(LANGUAGES)) {
    if (key === norm || def.aliases.includes(norm)) return key;
  }
  return null;
}
