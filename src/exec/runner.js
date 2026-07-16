import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { LANGUAGES, WORKSPACE_DIR, config } from '../config.js';

function runCommand(cmd, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + '\n' + err.message, code: -1, timedOut });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });
  });
}

function javaClassName(code) {
  const m = code.match(/public\s+class\s+(\w+)/);
  return m ? m[1] : 'Main';
}

/**
 * Compile (if needed) and run a code snippet for the given language, in an isolated
 * per-session workspace directory. Returns { stdout, stderr, exitCode, timedOut, phase }
 * where phase is "compile" if it never got to run, or "run".
 */
export async function runCode(sessionId, language, code) {
  const def = LANGUAGES[language];
  if (!def) throw new Error(`Unsupported language: ${language}`);

  const dir = path.join(WORKSPACE_DIR, sessionId, crypto.randomUUID());
  fs.mkdirSync(dir, { recursive: true });

  const timeoutMs = config.execTimeoutMs;
  let file;
  let runSpec;

  if (language === 'java') {
    const className = javaClassName(code);
    file = path.join(dir, `${className}.java`);
    fs.writeFileSync(file, code);
    const compile = await runCommand('javac', [file], { cwd: dir, timeoutMs });
    if (compile.code !== 0) return { ...compile, exitCode: compile.code, phase: 'compile' };
    runSpec = { cmd: 'java', args: ['-cp', dir, className] };
  } else if (def.compile) {
    file = path.join(dir, `snippet.${def.ext}`);
    fs.writeFileSync(file, code);
    const outFile = path.join(dir, 'out_bin');
    const { cmd, args } = def.compile(file, outFile);
    const compile = await runCommand(cmd, args, { cwd: dir, timeoutMs });
    if (compile.code !== 0) return { ...compile, exitCode: compile.code, phase: 'compile' };
    runSpec = def.run(outFile);
  } else {
    file = path.join(dir, `snippet.${def.ext}`);
    fs.writeFileSync(file, code);
    runSpec = def.run(file);
  }

  const result = await runCommand(runSpec.cmd, runSpec.args, { cwd: dir, timeoutMs });
  return { ...result, exitCode: result.code, phase: 'run' };
}
