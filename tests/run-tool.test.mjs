import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RUN_TIMEOUT_MS,
  commandRequestsNpmOffline,
  prepareInvocation,
  runShellSync,
  runTool,
  runToolSync,
} from '../dist/utils/run-tool.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER = 'src/utils/run-tool.ts';
const CHILD_PROCESS_USE = /\bfrom\s+['"](?:node:)?child_process['"]|\bimport\s*\(\s*['"](?:node:)?child_process['"]\s*\)|\brequire\s*\(\s*['"](?:node:)?child_process['"]\s*\)/;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function listSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('run-tool', () => {
  it('applies a positive default timeout', () => {
    const prepared = prepareInvocation('git', ['status']);
    assert.equal(prepared.timeoutMs, DEFAULT_RUN_TIMEOUT_MS);
    assert.equal(prepared.stdin, 'ignore');
    assert.throws(() => prepareInvocation('git', [], { timeoutMs: 0 }), /positive number/);
  });

  it('returns timeout when the child outlives timeoutMs', () => {
    const result = runToolSync(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      timeoutMs: 200,
      killSignal: 'SIGKILL',
      offline: false,
    });
    assert.equal(result.status, 'timeout');
    assert.equal(result.timedOut, true);
    assert.equal(result.environmentFailure, false);
  });

  it('returns timeout from the async path', async () => {
    const result = await runTool(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      timeoutMs: 200,
      killSignal: 'SIGKILL',
      offline: false,
    });
    assert.equal(result.status, 'timeout');
    assert.equal(result.timedOut, true);
  });

  it('classifies a missing executable as environment_failure (ENOENT)', () => {
    const result = runToolSync('dp-missing-bin-enoent', [], { timeoutMs: 5000, offline: false });
    assert.equal(result.status, 'environment_failure');
    assert.equal(result.environmentFailure, true);
    assert.equal(result.error?.code, 'ENOENT');
  });

  it('classifies dash command-not-found as environment_failure', () => {
    const dash = ['/bin/dash', '/usr/bin/dash'].find((path) => existsSync(path));
    assert.ok(dash, 'dash is required to assert the Debian/Ubuntu not-found format');
    const result = runToolSync(dash, ['-c', 'dp-missing-dash-bin'], { timeoutMs: 5000, offline: false });
    assert.equal(result.status, 'environment_failure');
    assert.match(result.stderr, /not found/);
    assert.match(result.stderr, /dash:|\/bin\/sh:/);
  });

  it('classifies /bin/sh (dash) command-not-found from a shell string', () => {
    const result = runShellSync('dp-missing-dash-bin --version', { timeoutMs: 5000, offline: false });
    assert.equal(result.status, 'environment_failure');
    assert.match(result.stderr, /not found/);
  });

  it('does not treat a normal non-zero exit as an environment failure', () => {
    const result = runToolSync(process.execPath, ['-e', 'process.exit(2)'], { timeoutMs: 5000, offline: false });
    assert.equal(result.status, 'error');
    assert.equal(result.exitCode, 2);
    assert.equal(result.environmentFailure, false);
  });

  it('does not inherit stdin unless asked', () => {
    const result = runToolSync(
      process.execPath,
      ['-e', 'process.stdout.write(process.stdin.isTTY ? "tty" : "notty")'],
      { timeoutMs: 5000, offline: false },
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout, 'notty');
  });

  it('writes provided input on a pipe instead of inheriting the terminal', () => {
    const result = runToolSync(
      process.execPath,
      ['-e', 'let s=""; process.stdin.on("data", (d) => { s += d; }); process.stdin.on("end", () => process.stdout.write(s));'],
      { timeoutMs: 5000, input: 'hello', offline: false },
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout, 'hello');
  });

  it('injects npm offline env and npx --offline by default', () => {
    const npx = prepareInvocation('npx', ['tsc', '--version']);
    assert.equal(npx.env.npm_config_offline, 'true');
    assert.deepEqual(npx.args, ['--offline', 'tsc', '--version']);

    const npm = prepareInvocation('npm', ['test']);
    assert.equal(npm.env.npm_config_offline, 'true');
    assert.deepEqual(npm.args, ['test']);

    const shell = prepareInvocation('npm test && echo ok', [], { shell: true });
    assert.equal(shell.env.npm_config_offline, 'true');

    const git = prepareInvocation('git', ['commit', '-m', 'mention npm']);
    assert.equal(git.env.npm_config_offline, undefined);
    assert.equal(commandRequestsNpmOffline('echo npm'), false);
    assert.equal(commandRequestsNpmOffline('pnpm test'), false);
    assert.equal(commandRequestsNpmOffline('npx tsc'), true);

    const optedOut = prepareInvocation('npx', ['tsc'], { offline: false, env: {} });
    assert.equal(optedOut.env.npm_config_offline, undefined);
    assert.deepEqual(optedOut.args, ['tsc']);
  });

  it('passes npm_config_offline through to the child when offline is forced', () => {
    const result = runToolSync(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.npm_config_offline || "missing")'],
      { timeoutMs: 5000, offline: true },
    );
    assert.equal(result.status, 'ok');
    assert.equal(result.stdout, 'true');
  });

  it('does not set npm offline env for unrelated commands', () => {
    const result = runToolSync(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.npm_config_offline || "missing")'],
      { timeoutMs: 5000, offline: false },
    );
    assert.equal(result.stdout, 'missing');
  });
});

describe('raw child_process ban', () => {
  it('fails when src imports child_process outside run-tool', () => {
    const files = listSourceFiles(join(ROOT, 'src'));
    const violations = [];
    let helperSeen = false;
    for (const file of files) {
      const rel = relative(ROOT, file).split('\\').join('/');
      const source = stripComments(readFileSync(file, 'utf8'));
      const usesChildProcess = CHILD_PROCESS_USE.test(source);
      if (rel === HELPER) {
        helperSeen = usesChildProcess;
        continue;
      }
      if (usesChildProcess) violations.push(rel);
    }
    assert.equal(helperSeen, true, `${HELPER} must stay the implementation of child_process`);
    assert.deepEqual(violations, []);
  });
});
