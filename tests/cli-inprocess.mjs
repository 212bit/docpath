/**
 * 在长驻子进程里复用已加载的 CLI，语义对齐 execSync：
 * 非 TTY、独立 argv/env/cwd、stdout 与 stderr 分开、非零退出不杀测试进程。
 * 并发用例仍应各自起子进程——宿主一次只跑一条命令。
 */
import { spawn } from 'node:child_process';
import {
  closeSync,
  constants,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const CLI = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const WORKER = fileURLToPath(new URL('./cli-worker.mjs', import.meta.url));

let child = null;
let reqFd = null;
let resFd = null;
let dir = null;
let seq = 0;

function ensureHost() {
  if (child && child.exitCode === null && !child.killed) return;
  shutdownHost();
  dir = mkdtempSync(join(tmpdir(), 'dp-cli-host-'));
  const reqPath = join(dir, 'req.fifo');
  const resPath = join(dir, 'res.fifo');
  execFileSync('mkfifo', [reqPath]);
  execFileSync('mkfifo', [resPath]);
  reqFd = openSync(reqPath, constants.O_RDWR | constants.O_NONBLOCK);
  resFd = openSync(resPath, constants.O_RDWR | constants.O_NONBLOCK);
  child = spawn(process.execPath, [WORKER, reqPath, resPath], {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: process.env,
  });
  child.on('error', () => {});
  child.unref();
}

process.on('exit', () => {
  if (child && child.exitCode === null) child.kill('SIGKILL');
});

function shutdownHost() {
  if (reqFd !== null) {
    try { closeSync(reqFd); } catch { /* ignore */ }
    reqFd = null;
  }
  if (resFd !== null) {
    try { closeSync(resFd); } catch { /* ignore */ }
    resFd = null;
  }
  if (child) {
    child.kill();
    child = null;
  }
  if (dir) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    dir = null;
  }
}

function readResponse(id, deadline) {
  const buf = Buffer.alloc(1024 * 64);
  let pending = '';
  while (Date.now() < deadline) {
    if (!child || child.exitCode !== null) {
      throw new Error(`docpath cli host exited (${child ? child.exitCode : 'missing'})`);
    }
    try {
      const n = readSync(resFd, buf, 0, buf.length, null);
      pending += buf.slice(0, n).toString('utf-8');
      let nl = pending.indexOf('\n');
      while (nl !== -1) {
        const line = pending.slice(0, nl);
        pending = pending.slice(nl + 1);
        const message = JSON.parse(line);
        if (message.id === id) return message;
        nl = pending.indexOf('\n');
      }
    } catch (err) {
      if (err.code !== 'EAGAIN' && err.code !== 'EWOULDBLOCK') throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  return null;
}

/**
 * @param {string} input
 * @returns {string[]}
 */
export function splitCliArgs(input) {
  const args = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match = re.exec(input);
  while (match) {
    args.push(match[1] ?? match[2] ?? match[3]);
    match = re.exec(input);
  }
  return args;
}

/**
 * @param {string[]} args docpath 参数，不含 node / entry
 * @param {{ cwd?: string, input?: string, env?: NodeJS.ProcessEnv, timeout?: number }} [options]
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function runCliSync(args, options = {}) {
  ensureHost();
  const id = ++seq;
  const timeout = options.timeout ?? 30000;
  const env = { ...(options.env ?? process.env), DOCPATH_RESET_RUNNER_PROBE: '1' };
  let stdinDir = null;
  if (options.input !== undefined) {
    stdinDir = mkdtempSync(join(tmpdir(), 'dp-stdin-'));
    const file = join(stdinDir, 'stdin.txt');
    writeFileSync(file, options.input);
    env.DOCPATH_STDIN_FILE = file;
  }
  const envFile = join(dir, `env-${id}.json`);
  writeFileSync(envFile, JSON.stringify(env));
  const request = `${JSON.stringify({
    id,
    argv: [process.execPath, CLI, ...args],
    cwd: options.cwd ?? process.cwd(),
    envFile,
  })}\n`;
  writeSync(reqFd, request);

  const deadline = Date.now() + timeout + 5000;
  try {
    const message = readResponse(id, deadline);
    if (!message) {
      shutdownHost();
      const error = new Error(`docpath ${args.join(' ')} timed out after ${timeout}ms`);
      error.status = null;
      error.stdout = '';
      error.stderr = error.message;
      throw error;
    }
    if (message.error && message.code !== 0 && !message.stderr && !message.stdout) {
      message.stderr = `${message.error}\n`;
    }
    return { code: message.code, stdout: message.stdout || '', stderr: message.stderr || '' };
  } finally {
    if (stdinDir) {
      try { rmSync(stdinDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

/**
 * 对齐 execSync/execFileSync：成功返回 stdout，失败抛出带 status/stdout/stderr 的 Error。
 * @param {string[]|string} args
 * @param {string} cwd
 * @param {{ input?: string, env?: NodeJS.ProcessEnv, timeout?: number }} [options]
 */
export function runCliSyncOrThrow(args, cwd, options = {}) {
  const argv = Array.isArray(args) ? args : splitCliArgs(args);
  const result = runCliSync(argv, { ...options, cwd });
  if (result.code === 0) return result.stdout;
  const error = new Error(`Command failed: docpath ${argv.join(' ')}\n${result.stderr || ''}${result.stdout || ''}`);
  error.status = result.code;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  throw error;
}
