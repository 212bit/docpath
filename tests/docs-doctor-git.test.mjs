import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fixDocumentHealth, getStagedFiles, runDocsDoctorGit } from '../dist/utils/docs-doctor.js';

const NODE_BIN = dirname(process.execPath);

function gitEnv(pathDir, extra = {}) {
  return {
    PATH: `${pathDir}:${NODE_BIN}:/usr/bin:/bin`,
    HOME: process.env.HOME || '',
    ...extra,
  };
}

function writeGit(binDir, body) {
  mkdirSync(binDir, { recursive: true });
  const git = join(binDir, 'git');
  writeFileSync(git, body);
  chmodSync(git, 0o755);
  return git;
}

function project(prefix) {
  const cwd = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
  mkdirSync(join(cwd, 'docs'), { recursive: true });
  return cwd;
}

describe('docs-doctor git via run-tool', () => {
  it('parses staged names and keeps the original diff argv, ignored stdin, and no npm offline env', async () => {
    const cwd = project('dp-doctor-git-ok-');
    const bin = join(cwd, 'bin');
    const log = join(cwd, 'git-log.json');
    writeGit(bin, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.DOCS_DOCTOR_GIT_LOG, JSON.stringify({
  argv: process.argv.slice(2),
  stdinIsTTY: process.stdin.isTTY === true,
  offline: process.env.npm_config_offline ?? null,
}));
process.stdout.write('docs/a.md\\n\\n src/index.ts \\n');
`);
    try {
      const staged = await getStagedFiles(cwd, {
        timeoutMs: 5000,
        env: gitEnv(bin, { DOCS_DOCTOR_GIT_LOG: log }),
      });
      assert.deepEqual(staged, ['docs/a.md', 'src/index.ts']);
      const recorded = JSON.parse(readFileSync(log, 'utf8'));
      assert.deepEqual(recorded.argv, ['diff', '--cached', '--name-only']);
      assert.equal(recorded.stdinIsTTY, false);
      assert.equal(recorded.offline, null);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('maps a missing git to environment_failure and an empty staged list', async () => {
    const cwd = project('dp-doctor-git-miss-');
    const emptyBin = join(cwd, 'empty-bin');
    mkdirSync(emptyBin, { recursive: true });
    const env = { PATH: emptyBin, HOME: process.env.HOME || '' };
    try {
      const started = Date.now();
      const result = await runDocsDoctorGit(cwd, ['diff', '--cached', '--name-only'], {
        timeoutMs: 5000,
        env,
      });
      const staged = await getStagedFiles(cwd, { timeoutMs: 5000, env });
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 2000, `missing git must fail immediately, took ${elapsed}ms`);
      assert.equal(result.status, 'environment_failure');
      assert.equal(result.environmentFailure, true);
      assert.equal(result.timedOut, false);
      assert.equal(result.error?.code, 'ENOENT');
      assert.deepEqual(staged, []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('maps a hung git to timeout and an empty staged list', async () => {
    const cwd = project('dp-doctor-git-hang-');
    const bin = join(cwd, 'bin');
    writeGit(bin, `#!/usr/bin/env node
setTimeout(() => {}, 30000);
`);
    const env = gitEnv(bin);
    try {
      const started = Date.now();
      const result = await runDocsDoctorGit(cwd, ['diff', '--cached', '--name-only'], {
        timeoutMs: 200,
        killSignal: 'SIGKILL',
        env,
      });
      const staged = await getStagedFiles(cwd, { timeoutMs: 200, killSignal: 'SIGKILL', env });
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 3000, `hung git must be killed by timeout, took ${elapsed}ms`);
      assert.equal(result.status, 'timeout');
      assert.equal(result.timedOut, true);
      assert.equal(result.environmentFailure, false);
      assert.deepEqual(staged, []);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('still heals and re-stages through git add when git is present', async () => {
    const cwd = project('dp-doctor-git-add-');
    const bin = join(cwd, 'bin');
    const log = join(cwd, 'git-log.json');
    writeFileSync(join(cwd, 'docs', 'note.md'), 'no heading yet\n', 'utf8');
    writeGit(bin, `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
writeFileSync(process.env.DOCS_DOCTOR_GIT_LOG, JSON.stringify({ argv: process.argv.slice(2) }));
`);
    try {
      const fixed = await fixDocumentHealth(cwd, {
        reStage: true,
        gitCall: { timeoutMs: 5000, env: gitEnv(bin, { DOCS_DOCTOR_GIT_LOG: log }) },
      });
      assert.ok(fixed.healedHeadings.includes('docs/note.md'));
      assert.match(readFileSync(join(cwd, 'docs', 'note.md'), 'utf8'), /^# Note\n/);
      const recorded = JSON.parse(readFileSync(log, 'utf8'));
      assert.deepEqual(recorded.argv, ['add', '--', 'docs/note.md']);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps the heal when re-stage git is missing', async () => {
    const cwd = project('dp-doctor-git-add-miss-');
    const emptyBin = join(cwd, 'empty-bin');
    mkdirSync(emptyBin, { recursive: true });
    writeFileSync(join(cwd, 'docs', 'note.md'), 'no heading yet\n', 'utf8');
    try {
      const started = Date.now();
      const fixed = await fixDocumentHealth(cwd, {
        reStage: true,
        gitCall: { timeoutMs: 5000, env: { PATH: emptyBin, HOME: process.env.HOME || '' } },
      });
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 3000, `missing git add must not hang, took ${elapsed}ms`);
      assert.ok(fixed.healedHeadings.includes('docs/note.md'));
      assert.match(readFileSync(join(cwd, 'docs', 'note.md'), 'utf8'), /^# Note\n/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('keeps the heal when re-stage git times out', async () => {
    const cwd = project('dp-doctor-git-add-hang-');
    const bin = join(cwd, 'bin');
    writeFileSync(join(cwd, 'docs', 'note.md'), 'no heading yet\n', 'utf8');
    writeGit(bin, `#!/usr/bin/env node
setTimeout(() => {}, 30000);
`);
    try {
      const started = Date.now();
      const fixed = await fixDocumentHealth(cwd, {
        reStage: true,
        gitCall: { timeoutMs: 200, killSignal: 'SIGKILL', env: gitEnv(bin) },
      });
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 3000, `hung git add must be killed by timeout, took ${elapsed}ms`);
      assert.ok(fixed.healedHeadings.includes('docs/note.md'));
      assert.match(readFileSync(join(cwd, 'docs', 'note.md'), 'utf8'), /^# Note\n/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
