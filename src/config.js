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

// Runtime map: how to detect, install (Termux/Debian package name) and run/compile each
// supported language. Every `pkg` name here was checked against Termux's live apt index
// (packages.termux.dev), not guessed — a wrong package name would just fail loudly at
// install time, so it's worth getting right. Kept as plain data so it's easy to extend.
export const LANGUAGES = {
  python: {
    aliases: ['python', 'python3', 'py'],
    ext: 'py',
    bin: 'python3',
    pkg: 'python',
    run: (file) => ({ cmd: 'python3', args: [file] }),
  },
  javascript: {
    aliases: ['javascript', 'js', 'node', 'nodejs'],
    ext: 'js',
    bin: 'node',
    pkg: 'nodejs',
    run: (file) => ({ cmd: 'node', args: [file] }),
  },
  bash: {
    aliases: ['bash', 'sh', 'shell'],
    ext: 'sh',
    bin: 'bash',
    pkg: 'bash',
    run: (file) => ({ cmd: 'bash', args: [file] }),
  },
  c: {
    aliases: ['c'],
    ext: 'c',
    bin: 'clang',
    pkg: 'clang',
    compile: (file, outFile) => ({ cmd: 'clang', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  cpp: {
    aliases: ['cpp', 'c++', 'cplusplus'],
    ext: 'cpp',
    bin: 'clang++',
    pkg: 'clang',
    compile: (file, outFile) => ({ cmd: 'clang++', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  java: {
    aliases: ['java'],
    ext: 'java',
    bin: 'javac',
    pkg: 'openjdk-17',
    compile: (file) => ({ cmd: 'javac', args: [file] }),
    run: (file, className) => ({ cmd: 'java', args: ['-cp', path.dirname(file), className] }),
  },
  go: {
    aliases: ['go', 'golang'],
    ext: 'go',
    bin: 'go',
    pkg: 'golang',
    run: (file) => ({ cmd: 'go', args: ['run', file] }),
  },
  rust: {
    aliases: ['rust', 'rs'],
    ext: 'rs',
    bin: 'rustc',
    pkg: 'rust',
    compile: (file, outFile) => ({ cmd: 'rustc', args: [file, '-o', outFile] }),
    run: (outFile) => ({ cmd: outFile, args: [] }),
  },
  ruby: {
    aliases: ['ruby', 'rb'],
    ext: 'rb',
    bin: 'ruby',
    pkg: 'ruby',
    run: (file) => ({ cmd: 'ruby', args: [file] }),
  },
  php: {
    aliases: ['php'],
    ext: 'php',
    bin: 'php',
    pkg: 'php',
    run: (file) => ({ cmd: 'php', args: [file] }),
  },
  perl: {
    aliases: ['perl', 'pl'],
    ext: 'pl',
    bin: 'perl',
    pkg: 'perl',
    run: (file) => ({ cmd: 'perl', args: [file] }),
  },
  lua: {
    aliases: ['lua'],
    ext: 'lua',
    bin: 'lua5.4',
    pkg: 'lua54',
    run: (file) => ({ cmd: 'lua5.4', args: [file] }),
  },
  swift: {
    aliases: ['swift'],
    ext: 'swift',
    bin: 'swift',
    pkg: 'swift',
    run: (file) => ({ cmd: 'swift', args: [file] }),
  },
  kotlin: {
    aliases: ['kotlin', 'kt'],
    ext: 'kt',
    bin: 'kotlinc',
    pkg: 'kotlin',
    compile: (file, outFile) => ({ cmd: 'kotlinc', args: [file, '-include-runtime', '-d', `${outFile}.jar`] }),
    run: (outFile) => ({ cmd: 'java', args: ['-jar', `${outFile}.jar`] }),
  },
  scala: {
    aliases: ['scala'],
    ext: 'scala',
    bin: 'scala',
    pkg: 'scala',
    run: (file) => ({ cmd: 'scala', args: [file] }),
  },
  erlang: {
    aliases: ['erlang', 'erl'],
    ext: 'erl',
    bin: 'escript',
    pkg: 'erlang',
    run: (file) => ({ cmd: 'escript', args: [file] }),
  },
  elixir: {
    aliases: ['elixir', 'ex', 'exs'],
    ext: 'exs',
    bin: 'elixir',
    pkg: 'elixir',
    run: (file) => ({ cmd: 'elixir', args: [file] }),
  },
  haskell: {
    aliases: ['haskell', 'hs'],
    ext: 'hs',
    bin: 'runghc',
    pkg: 'ghc',
    run: (file) => ({ cmd: 'runghc', args: [file] }),
  },
  dart: {
    aliases: ['dart'],
    ext: 'dart',
    bin: 'dart',
    pkg: 'dart',
    run: (file) => ({ cmd: 'dart', args: ['run', file] }),
  },
  nim: {
    aliases: ['nim'],
    ext: 'nim',
    bin: 'nim',
    pkg: 'nim',
    run: (file) => ({ cmd: 'nim', args: ['r', '--hints:off', file] }),
  },
  zig: {
    aliases: ['zig'],
    ext: 'zig',
    bin: 'zig',
    pkg: 'zig',
    run: (file) => ({ cmd: 'zig', args: ['run', file] }),
  },
  crystal: {
    aliases: ['crystal', 'cr'],
    ext: 'cr',
    bin: 'crystal',
    pkg: 'crystal',
    run: (file) => ({ cmd: 'crystal', args: ['run', file] }),
  },
  d: {
    aliases: ['d', 'dlang'],
    ext: 'd',
    bin: 'ldc2',
    pkg: 'ldc',
    run: (file) => ({ cmd: 'ldc2', args: ['-run', file] }),
  },
  tcl: {
    aliases: ['tcl'],
    ext: 'tcl',
    bin: 'tclsh',
    pkg: 'tcl',
    run: (file) => ({ cmd: 'tclsh', args: [file] }),
  },
  racket: {
    aliases: ['racket', 'rkt'],
    ext: 'rkt',
    bin: 'racket',
    pkg: 'racket',
    run: (file) => ({ cmd: 'racket', args: [file] }),
  },
  scheme: {
    aliases: ['scheme', 'scm', 'guile'],
    ext: 'scm',
    bin: 'guile',
    pkg: 'guile',
    run: (file) => ({ cmd: 'guile', args: [file] }),
  },
  lisp: {
    aliases: ['lisp', 'commonlisp', 'cl'],
    ext: 'lisp',
    bin: 'sbcl',
    pkg: 'sbcl',
    run: (file) => ({ cmd: 'sbcl', args: ['--script', file] }),
  },
  prolog: {
    aliases: ['prolog'],
    ext: 'plog', // not ".pl" -- reserved for Perl above, swipl doesn't care what we name it
    bin: 'swipl',
    pkg: 'swi-prolog',
    run: (file) => ({ cmd: 'swipl', args: [file] }),
  },
  groovy: {
    aliases: ['groovy'],
    ext: 'groovy',
    bin: 'groovy',
    pkg: 'groovy',
    run: (file) => ({ cmd: 'groovy', args: [file] }),
  },
  csharp: {
    aliases: ['csharp', 'c#', 'cs'],
    ext: 'cs',
    bin: 'mcs',
    pkg: 'mono',
    compile: (file, outFile) => ({ cmd: 'mcs', args: [file, `-out:${outFile}.exe`] }),
    run: (outFile) => ({ cmd: 'mono', args: [`${outFile}.exe`] }),
  },
  forth: {
    aliases: ['forth'],
    ext: 'fs',
    bin: 'gforth',
    pkg: 'gforth',
    run: (file) => ({ cmd: 'gforth', args: [file, '-e', 'bye'] }),
  },
  octave: {
    aliases: ['octave', 'matlab'],
    ext: 'm',
    bin: 'octave',
    pkg: 'octave',
    run: (file) => ({ cmd: 'octave', args: ['--no-gui', '--quiet', file] }),
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
