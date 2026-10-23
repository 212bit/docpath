import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitGateBlocked, executeLifecycleHook } from '../dist/engine/hook-runner.js';
import { installDirtyGuardBlockHook } from '../dist/engine/gate-blocked.js';
import { diagnosePlugins } from '../dist/engine/plugin-system.js';
import {
  assertCleanWorktreeForNewTask,
  assertNoNonDocPathChangesForExecutionStart,
  setDirtyGuardBlockListener,
} from '../dist/utils/git-dirty-guard.js';
import { checkCommand } from '../dist/commands/check.js';
import { reviewCommand } from '../dist/commands/review.js';
import { mkExecWorkspace } from './helpers.mjs';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;
const EXAMPLE = new URL('../docs/examples/hooks/on-gate-blocked.sh', import.meta.url).pathname;
const INSTALLED_EXAMPLE = new URL('../.docpath/hooks/on-gate-blocked.sh', import.meta.url).pathname;

const RECORD_HOOK = `#!/usr/bin/env bash
out="$DOCPATH_CWD/.docpath/workspace"
mkdir -p "$out"
cat > "$out/gate-hook-stdin.json"
{
  printf 'DOCPATH_HOOK_EVENT=%s\\n' "$DOCPATH_HOOK_EVENT"
  printf 'DOCPATH_TASK=%s\\n' "$DOCPATH_TASK"
  printf 'DOCPATH_TASK_ID=%s\\n' "$DOCPATH_TASK_ID"
  printf 'DOCPATH_STEP=%s\\n' "$DOCPATH_STEP"
  printf 'DOCPATH_CURRENT_STEP=%s\\n' "$DOCPATH_CURRENT_STEP"
  printf 'DOCPATH_GATE=%s\\n' "$DOCPATH_GATE"
  printf 'DOCPATH_REASON=%s\\n' "$DOCPATH_REASON"
  printf 'DOCPATH_PATHS=%s\\n' "$DOCPATH_PATHS"
  printf 'DOCPATH_GATE_CONTEXT=%s\\n' "$DOCPATH_GATE_CONTEXT"
} > "$out/gate-hook-env.txt"
`;

function git(cwd, args) {
  execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function initRepo(cwd) {
  git(cwd, ['init']);
  git(cwd, ['config', 'user.email', 'test@example.com']);
  git(cwd, ['config', 'user.name', 'Test']);
  writeFileSync(join(cwd, 'README.md'), 'hi\n');
  git(cwd, ['add', 'README.md']);
  git(cwd, ['commit', '-m', 'init']);
}

function commitAll(cwd, message) {
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', message]);
}

function writeHook(cwd, body) {
  const dir = join(cwd, '.docpath', 'hooks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'on-gate-blocked.sh'), body);
}

function writeState(cwd, overrides = {}) {
  const dir = join(cwd, '.docpath', 'workspace');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'state.json'), JSON.stringify({
    level: 2,
    task_id: 'T-STATE',
    task_title: 'gate hook',
    phase: 'planning',
    state: 'planning',
    gate: 'none',
    current_step: 'S0',
    started_at: '2026-06-18T00:00:00.000Z',
    updated_at: '2026-06-18T00:00:00.000Z',
    ...overrides,
  }, null, 2));
}

function readCapture(cwd) {
  const stdinPath = join(cwd, '.docpath', 'workspace', 'gate-hook-stdin.json');
  const envPath = join(cwd, '.docpath', 'workspace', 'gate-hook-env.txt');
  assert.equal(existsSync(stdinPath), true, 'hook should receive stdin JSON');
  const payload = JSON.parse(readFileSync(stdinPath, 'utf-8'));
  const env = readFileSync(envPath, 'utf-8');
  return { payload, env };
}

describe('on-gate-blocked hook', () => {
  let cwd;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'dp-gate-hook-'));
  });

  afterEach(() => {
    setDirtyGuardBlockListener(null);
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it('does not install the ntfy example by default, and skips when the topic is unset', () => {
    assert.equal(existsSync(INSTALLED_EXAMPLE), false);
    const env = { ...process.env };
    delete env.DOCPATH_NTFY_TOPIC;
    execFileSync('bash', [EXAMPLE], { env, stdio: 'pipe' });
  });

  it('delivers hippo-gate context on stdin and env without a hippo-gate module', async () => {
    writeHook(cwd, RECORD_HOOK);
    writeState(cwd);
    await emitGateBlocked(cwd, {
      gate: 'hippo-gate',
      taskId: 'T-HIPPO',
      step: 'S1',
      reason: 'pre-step self-review blocked',
    });
    const { payload, env } = readCapture(cwd);
    assert.equal(payload.event, 'on-gate-blocked');
    assert.equal(payload.gate, 'hippo-gate');
    assert.equal(payload.task_id, 'T-HIPPO');
    assert.equal(payload.step, 'S1');
    assert.equal(payload.reason, 'pre-step self-review blocked');
    assert.deepEqual(payload.paths, []);
    assert.match(env, /^DOCPATH_HOOK_EVENT=on-gate-blocked$/m);
    assert.match(env, /^DOCPATH_TASK=T-HIPPO$/m);
    assert.match(env, /^DOCPATH_TASK_ID=T-HIPPO$/m);
    assert.match(env, /^DOCPATH_STEP=S1$/m);
    assert.match(env, /^DOCPATH_CURRENT_STEP=S1$/m);
    assert.match(env, /^DOCPATH_GATE=hippo-gate$/m);
    assert.match(env, /^DOCPATH_REASON=pre-step self-review blocked$/m);
    assert.match(env, /^DOCPATH_PATHS=\[\]$/m);
    const echoed = env.match(/^DOCPATH_GATE_CONTEXT=(.*)$/m)?.[1];
    assert.deepEqual(JSON.parse(echoed), payload);
  });

  it('accepts on-gate-blocked in a plugin manifest and config.yaml stdin', async () => {
    const pluginDir = join(cwd, '.docpath', 'plugins', 'notify');
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'notify',
      hooks: { 'on-gate-blocked': [{ command: 'cat > .docpath/workspace/from-plugin.json', name: 'capture' }] },
    }));
    const report = await diagnosePlugins(cwd);
    assert.equal(report.healthy, true);

    mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
    writeFileSync(join(cwd, '.docpath', 'config.yaml'), [
      'hooks:',
      '  on-gate-blocked:',
      '    - name: capture',
      '      command: cat > .docpath/workspace/from-config.json',
      '      fail_fast: true',
      '',
    ].join('\n'));
    await emitGateBlocked(cwd, { gate: 'check', taskId: 'T-CFG', step: 'S9', reason: 'from config' });
    const payload = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'from-config.json'), 'utf-8'));
    assert.equal(payload.gate, 'check');
    assert.equal(payload.task_id, 'T-CFG');
    assert.equal(payload.step, 'S9');
    assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'from-plugin.json')), true);
  });

  it('keeps manual hook run strict while gate emission stays best-effort', async () => {
    writeHook(cwd, '#!/usr/bin/env bash\necho fail >&2\nexit 1\n');
    const manual = await executeLifecycleHook(cwd, 'on-gate-blocked', {
      gate: 'check',
      taskId: 'T-MANUAL',
      reason: 'manual',
    });
    assert.equal(manual.passed, false);
    assert.equal(manual.results[0].passed, false);

    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.map(String).join(' '));
    try {
      await emitGateBlocked(cwd, { gate: 'check', taskId: 'T-MANUAL', reason: 'still blocked' });
    } finally {
      console.warn = original;
    }
    assert.match(warnings.join('\n'), /Gate outcome unchanged/);
  });

  describe('git-dirty-guard', () => {
    beforeEach(() => {
      installDirtyGuardBlockHook();
      initRepo(cwd);
    });

    it('fires with explicit task, step, reason, and offending paths', () => {
      writeState(cwd, { task_id: 'T-STATE', current_step: 'S0' });
      writeHook(cwd, RECORD_HOOK);
      commitAll(cwd, 'hook');
      mkdirSync(join(cwd, 'src'));
      writeFileSync(join(cwd, 'src', 'app.ts'), 'export const a = 1;\n');

      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', { taskId: 'T-EXPLICIT', step: 'S2' }),
        /拒绝进入执行步骤/,
      );
      const { payload, env } = readCapture(cwd);
      assert.equal(payload.gate, 'git-dirty-guard');
      assert.equal(payload.task_id, 'T-EXPLICIT');
      assert.equal(payload.step, 'S2');
      assert.deepEqual(payload.paths, ['src/app.ts']);
      assert.match(payload.reason, /docpath go: .*拒绝进入执行步骤/);
      assert.match(env, /^DOCPATH_GATE=git-dirty-guard$/m);
      assert.match(env, /^DOCPATH_TASK=T-EXPLICIT$/m);
      assert.match(env, /^DOCPATH_PATHS=\["src\/app\.ts"\]$/m);
    });

    it('fires for a new-task block and falls back to state for task and step', () => {
      writeState(cwd, { task_id: 'T-STATE', current_step: 'S0' });
      writeHook(cwd, RECORD_HOOK);
      commitAll(cwd, 'baseline');
      writeFileSync(join(cwd, 'notes.txt'), 'dirty\n');

      assert.throws(
        () => assertCleanWorktreeForNewTask(cwd, 'docpath start'),
        /拒绝在 dirty worktree 上启动新任务/,
      );
      const { payload } = readCapture(cwd);
      assert.equal(payload.gate, 'git-dirty-guard');
      assert.equal(payload.task_id, 'T-STATE');
      assert.equal(payload.step, 'S0');
      assert.deepEqual(payload.paths, ['notes.txt']);
    });

    it('does not fire when the worktree is clean enough to pass', () => {
      writeState(cwd);
      writeHook(cwd, RECORD_HOOK);
      commitAll(cwd, 'clean');
      assert.doesNotThrow(() => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', {
        taskId: 'T-STATE',
        step: 'S1',
      }));
      assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'gate-hook-stdin.json')), false);
    });

    it('keeps the dirty-guard error when the hook exits non-zero', () => {
      writeHook(cwd, '#!/usr/bin/env bash\necho boom >&2\nexit 1\n');
      commitAll(cwd, 'bad hook');
      writeFileSync(join(cwd, 'notes.txt'), 'dirty\n');
      let caught;
      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      try {
        assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', { taskId: 'T-1', step: 'S1' });
      } catch (error) {
        caught = error;
      } finally {
        console.warn = original;
      }
      assert.match(caught.message, /拒绝进入执行步骤/);
      assert.doesNotMatch(caught.message, /boom|on-gate-blocked/);
      assert.match(warnings.join('\n'), /Gate outcome unchanged/);
    });

    it('keeps the dirty-guard error when the hook hangs', { timeout: 15000 }, () => {
      writeHook(cwd, '#!/usr/bin/env bash\nsleep 30\n');
      commitAll(cwd, 'slow hook');
      writeFileSync(join(cwd, 'notes.txt'), 'dirty\n');
      const started = Date.now();
      assert.throws(
        () => assertNoNonDocPathChangesForExecutionStart(cwd, 'docpath go', { taskId: 'T-1', step: 'S1' }),
        /拒绝进入执行步骤/,
      );
      assert.ok(Date.now() - started < 8000, 'hanging hook should be capped by the short timeout');
    });

    it('fires from the CLI dirty-worktree guard', () => {
      writeHook(cwd, RECORD_HOOK);
      commitAll(cwd, 'hook');
      writeFileSync(join(cwd, 'notes.txt'), 'dirty\n');
      let output = '';
      let code = 0;
      try {
        execFileSync(process.execPath, [BIN, 'start', 'notify gate', '--cwd', cwd], {
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000,
        });
      } catch (error) {
        code = error.status || 1;
        output = `${error.stdout || ''}${error.stderr || ''}`;
      }
      assert.notEqual(code, 0);
      assert.match(output, /拒绝在 dirty worktree 上启动新任务/);
      const { payload } = readCapture(cwd);
      assert.equal(payload.gate, 'git-dirty-guard');
      assert.ok(payload.paths.includes('notes.txt'));
    });
  });

  describe('check', () => {
    function idleWorkspace() {
      mkdirSync(join(cwd, '.docpath', 'workspace'), { recursive: true });
      writeFileSync(join(cwd, '.docpath', 'config.yaml'), 'project:\n  name: gate-hook\n');
      writeState(cwd, {
        level: 0,
        task_id: '',
        phase: 'idle',
        state: 'idle',
        gate: 'none',
        current_step: '',
      });
    }

    it('fires when task identity blocks check', async () => {
      idleWorkspace();
      writeState(cwd, {
        level: 2,
        task_id: 'T-CHECK-BLOCK',
        phase: 'executing',
        state: 'executing',
        gate: 'none',
        current_step: 'S4',
      });
      writeHook(cwd, RECORD_HOOK);
      await assert.rejects(
        () => checkCommand({ cwd, lite: true, force: true }),
        /docpath check failed: 任务身份一致性检查/,
      );
      const { payload, env } = readCapture(cwd);
      assert.equal(payload.gate, 'check');
      assert.equal(payload.task_id, 'T-CHECK-BLOCK');
      assert.equal(payload.step, 'S4');
      assert.match(payload.reason, /任务身份一致性检查/);
      assert.deepEqual(payload.paths, []);
      assert.match(env, /^DOCPATH_GATE=check$/m);
    });

    it('does not fire when check passes', async () => {
      idleWorkspace();
      writeHook(cwd, RECORD_HOOK);
      await checkCommand({ cwd, lite: true, force: true });
      assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'gate-hook-stdin.json')), false);
    });

    it('still throws the check error when the hook fails or hangs', { timeout: 20000 }, async () => {
      idleWorkspace();
      writeState(cwd, {
        level: 2,
        task_id: 'T-CHECK-BLOCK',
        phase: 'executing',
        state: 'executing',
        gate: 'none',
        current_step: 'S4',
      });
      writeHook(cwd, '#!/usr/bin/env bash\necho nope >&2\nexit 1\n');
      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      try {
        await assert.rejects(
          () => checkCommand({ cwd, lite: true, force: true }),
          /docpath check failed: 任务身份一致性检查/,
        );
      } finally {
        console.warn = original;
      }
      assert.match(warnings.join('\n'), /Gate outcome unchanged/);

      writeHook(cwd, '#!/usr/bin/env bash\nsleep 30\n');
      const started = Date.now();
      await assert.rejects(
        () => checkCommand({ cwd, lite: true, force: true }),
        /docpath check failed: 任务身份一致性检查/,
      );
      assert.ok(Date.now() - started < 8000);
    });
  });

  describe('review', () => {
    function prep(body) {
      mkExecWorkspace(cwd);
      const statePath = join(cwd, '.docpath', 'workspace', 'state.json');
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      state.phase = 'checking';
      state.gate = 'check_pass';
      state.current_step = 'S3';
      state.task_id = 'T-REV';
      writeFileSync(statePath, JSON.stringify(state, null, 2));
      writeFileSync(join(cwd, '.docpath', 'config.json'), JSON.stringify({
        review_skill_gate: { enabled: false },
      }));
      initRepo(cwd);
      mkdirSync(join(cwd, 'app'));
      writeFileSync(join(cwd, 'app', 'sample.json'), body);
      writeHook(cwd, RECORD_HOOK);
    }

    it('fires when review rejects a finding and stays quiet when review passes', async () => {
      prep('{"p":"/home/secret"}\n');
      await reviewCommand({ cwd, force: true });
      const { payload, env } = readCapture(cwd);
      assert.equal(payload.gate, 'review');
      assert.equal(payload.task_id, 'T-REV');
      assert.equal(payload.step, 'S3');
      assert.match(payload.reason, /1 个错误/);
      assert.deepEqual(payload.paths, []);
      assert.match(env, /^DOCPATH_GATE=review$/m);
      const blocked = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(blocked.gate, 'review_fail');

      rmSync(join(cwd, '.docpath', 'workspace', 'gate-hook-stdin.json'));
      writeFileSync(join(cwd, 'app', 'sample.json'), '{"ok":true}\n');
      writeState(cwd, {
        level: 2,
        task_id: 'T-REV',
        phase: 'checking',
        state: 'checking',
        gate: 'check_pass',
        current_step: 'S3',
      });
      await reviewCommand({ cwd, force: true });
      assert.equal(existsSync(join(cwd, '.docpath', 'workspace', 'gate-hook-stdin.json')), false);
      const passed = JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8'));
      assert.equal(passed.gate, 'review_pass');
    });

    it('keeps review_fail when the hook fails or hangs', { timeout: 20000 }, async () => {
      prep('{"p":"/home/secret"}\n');
      writeHook(cwd, '#!/usr/bin/env bash\necho nope >&2\nexit 1\n');
      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      try {
        await reviewCommand({ cwd, force: true });
      } finally {
        console.warn = original;
      }
      assert.match(warnings.join('\n'), /Gate outcome unchanged/);
      assert.equal(JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8')).gate, 'review_fail');

      writeHook(cwd, '#!/usr/bin/env bash\nsleep 30\n');
      writeState(cwd, {
        level: 2,
        task_id: 'T-REV',
        phase: 'checking',
        state: 'checking',
        gate: 'check_pass',
        current_step: 'S3',
      });
      const started = Date.now();
      await reviewCommand({ cwd, force: true });
      assert.ok(Date.now() - started < 8000);
      assert.equal(JSON.parse(readFileSync(join(cwd, '.docpath', 'workspace', 'state.json'), 'utf-8')).gate, 'review_fail');
    });
  });
});
