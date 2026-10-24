/**
 * 长驻 CLI 宿主进程。父进程经 FIFO 送入一条 JSON 请求、收回一条 JSON 响应。
 * 独立进程才能 chdir，且 stdout 不是 TTY，对齐 execSync 子进程。
 */
import { createInterface } from 'node:readline';
import { createReadStream, openSync, writeSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { format } from 'node:util';
import { runCli } from '../dist/index.js';

const reqPath = process.argv[2];
const resPath = process.argv[3];

function hookWrite(push) {
  return function write(chunk, encoding, cb) {
    const encodingName = typeof encoding === 'string' ? encoding : 'utf8';
    push(Buffer.isBuffer(chunk) ? chunk.toString(encodingName) : String(chunk));
    const callback = typeof encoding === 'function' ? encoding : cb;
    if (typeof callback === 'function') callback();
    return true;
  };
}

function writeResponse(payload) {
  const fd = openSync(resPath, 'w');
  try {
    writeSync(fd, `${JSON.stringify(payload)}\n`);
  } finally {
    closeSync(fd);
  }
}

const lines = createInterface({ input: createReadStream(reqPath) });
let busy = false;
const queue = [];

async function handle(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (err) {
    writeResponse({ id: null, code: 1, stdout: '', stderr: `bad request: ${err.message}\n`, error: String(err) });
    return;
  }

  const stdout = [];
  const stderr = [];
  const prev = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    stdoutWrite: process.stdout.write,
    stderrWrite: process.stderr.write,
    cwd: process.cwd(),
    env: { ...process.env },
    exitCode: process.exitCode,
  };
  console.log = (...args) => { stdout.push(`${format(...args)}\n`); };
  console.info = (...args) => { stdout.push(`${format(...args)}\n`); };
  console.warn = (...args) => { stderr.push(`${format(...args)}\n`); };
  console.error = (...args) => { stderr.push(`${format(...args)}\n`); };
  process.stdout.write = hookWrite((text) => stdout.push(text));
  process.stderr.write = hookWrite((text) => stderr.push(text));

  const env = JSON.parse(readFileSync(msg.envFile, 'utf-8'));
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  const stdinFile = process.env.DOCPATH_STDIN_FILE;
  process.exitCode = undefined;
  let code = 1;
  let error = null;
  try {
    process.chdir(msg.cwd);
    code = await runCli(msg.argv);
  } catch (err) {
    error = err instanceof Error ? (err.stack || err.message) : String(err);
    code = 1;
  } finally {
    console.log = prev.log;
    console.info = prev.info;
    console.warn = prev.warn;
    console.error = prev.error;
    process.stdout.write = prev.stdoutWrite;
    process.stderr.write = prev.stderrWrite;
    try { process.chdir(prev.cwd); } catch { /* removed */ }
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, prev.env);
    process.exitCode = prev.exitCode;
    if (stdinFile) {
      try { rmSync(stdinFile, { force: true }); } catch { /* ignore */ }
    }
    try { rmSync(msg.envFile, { force: true }); } catch { /* ignore */ }
  }

  writeResponse({
    id: msg.id,
    code,
    stdout: stdout.join(''),
    stderr: stderr.join(''),
    error,
  });
}

function pump() {
  if (busy) return;
  const line = queue.shift();
  if (line === undefined) return;
  busy = true;
  handle(line).catch((err) => {
    writeResponse({ id: null, code: 1, stdout: '', stderr: `${err?.stack || err}\n`, error: String(err) });
  }).finally(() => {
    busy = false;
    pump();
  });
}

lines.on('line', (line) => {
  if (!line.trim()) return;
  queue.push(line);
  pump();
});
