import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

let withLock;

before(async () => {
  ({ withLock } = await import('../dist/utils/lock.js'));
});

function mkLockPath() {
  const dir = mkdtempSync(join(tmpdir(), 'dp-lock-'));
  return { dir, lockPath: join(dir, 'state.lock') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('withLock', () => {
  it('runs fn while holding the lock and releases it afterwards', async () => {
    const { dir, lockPath } = mkLockPath();
    let sawLockDuringFn = false;
    const result = await withLock(lockPath, async () => {
      sawLockDuringFn = existsSync(lockPath);
      return 42;
    });
    assert.equal(result, 42);
    assert.equal(sawLockDuringFn, true, '锁文件应在 fn 执行期间存在');
    assert.equal(existsSync(lockPath), false, '锁文件应在 fn 返回后被删除');
    rmSync(dir, { recursive: true, force: true });
  });

  it('serializes concurrent read-modify-write (the lost-update fix)', async () => {
    // 模拟两个并发 Agent 各自对同一计数文件做 读→+1→写。
    // 无锁时典型结果是 1（后写覆盖先写）；有锁时必为 2。
    const { dir, lockPath } = mkLockPath();
    const counterPath = join(dir, 'counter.txt');
    writeFileSync(counterPath, '0', 'utf-8');

    const rmw = () => withLock(lockPath, async () => {
      const cur = Number(readFileSync(counterPath, 'utf-8'));
      await sleep(20); // 放大竞态窗口
      writeFileSync(counterPath, String(cur + 1), 'utf-8');
    });

    await Promise.all([rmw(), rmw()]);
    assert.equal(Number(readFileSync(counterPath, 'utf-8')), 2, '两次 RMW 都应生效，无 lost update');
    assert.equal(existsSync(lockPath), false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('takes over a stale lock past staleMs', async () => {
    const { dir, lockPath } = mkLockPath();
    // 一个活进程持有、但时间戳很旧的锁 → 应被时间戳判定为 stale 抢占。
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() - 60_000 }), 'utf-8');

    let ran = false;
    await withLock(lockPath, async () => { ran = true; }, { staleMs: 1_000, timeoutMs: 2_000 });
    assert.equal(ran, true, '陈旧锁应被抢占，fn 应执行');
    rmSync(dir, { recursive: true, force: true });
  });

  it('takes over a lock held by a dead pid', async () => {
    const { dir, lockPath } = mkLockPath();
    // 时间戳很新，但持有者 PID 已不存在 → PID 存活探测判定可抢占。
    // PID 99999999 极不可能存在。
    writeFileSync(lockPath, JSON.stringify({ pid: 99_999_999, ts: Date.now() }), 'utf-8');

    let ran = false;
    await withLock(lockPath, async () => { ran = true; }, { staleMs: 60_000, timeoutMs: 2_000 });
    assert.equal(ran, true, '持有者已死的锁应被抢占');
    rmSync(dir, { recursive: true, force: true });
  });

  it('treats a corrupt lock file as stale', async () => {
    const { dir, lockPath } = mkLockPath();
    writeFileSync(lockPath, 'not-json{{{', 'utf-8');
    let ran = false;
    await withLock(lockPath, async () => { ran = true; }, { timeoutMs: 2_000 });
    assert.equal(ran, true, '损坏的锁文件应被视为 stale 并抢占');
    rmSync(dir, { recursive: true, force: true });
  });

  it('releases the lock even when fn throws', async () => {
    const { dir, lockPath } = mkLockPath();
    await assert.rejects(
      withLock(lockPath, async () => { throw new Error('boom'); }),
      /boom/,
    );
    assert.equal(existsSync(lockPath), false, 'fn 抛错后锁仍应释放');
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails loud when the lock stays held by a live holder past timeout', async () => {
    const { dir, lockPath } = mkLockPath();
    // 当前进程存活 + 时间戳新 → 永不 stale；总超时后应抛错（fail-loud）。
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8');
    await assert.rejects(
      withLock(lockPath, async () => { /* never reached */ }, {
        staleMs: 60_000,
        timeoutMs: 300,
        retryMs: 30,
      }),
      /获取状态锁超时/,
    );
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('lock ownership and atomic stale takeover (R-293)', () => {
  it('release verifies ownership: never deletes a lock taken over by another holder', async () => {
    const { dir, lockPath } = mkLockPath();
    let signalAcquired;
    const acquiredGate = new Promise((r) => { signalAcquired = r; });
    let releaseFn;
    const releaseGate = new Promise((r) => { releaseFn = r; });

    const holder = withLock(lockPath, async () => {
      signalAcquired();
      await releaseGate;
    }, { staleMs: 60_000 });

    await acquiredGate;
    // 模拟持锁超期被他人抢占重建：锁文件被替换为他人记录
    const foreignRecord = JSON.stringify({ pid: process.pid, ts: Date.now(), token: 'foreign-owner' });
    writeFileSync(lockPath, foreignRecord, 'utf-8');

    releaseFn();
    await holder;

    assert.equal(existsSync(lockPath), true, '易主后的锁不得被原持有者的释放误删');
    assert.match(readFileSync(lockPath, 'utf-8'), /foreign-owner/);
    rmSync(dir, { recursive: true, force: true });
  });

  it('legacy lock records without token fall back to pid ownership on release', async () => {
    const { dir, lockPath } = mkLockPath();
    let signalAcquired;
    const acquiredGate = new Promise((r) => { signalAcquired = r; });
    let releaseFn;
    const releaseGate = new Promise((r) => { releaseFn = r; });

    const holder = withLock(lockPath, async () => {
      signalAcquired();
      await releaseGate;
    }, { staleMs: 60_000 });

    await acquiredGate;
    // 旧格式（无 token）+ 同 pid → 按 pid 回退判定为本进程属主，允许释放
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }), 'utf-8');

    releaseFn();
    await holder;

    assert.equal(existsSync(lockPath), false, '旧格式同 pid 锁按回退规则正常释放');
    rmSync(dir, { recursive: true, force: true });
  });

  it('concurrent takeover of the same stale lock keeps mutual exclusion', async () => {
    const { dir, lockPath } = mkLockPath();
    const counterPath = join(dir, 'counter.txt');
    writeFileSync(counterPath, '0', 'utf-8');
    // 预置 stale 锁：死 pid + 过期时间戳
    writeFileSync(lockPath, JSON.stringify({ pid: 999999, ts: Date.now() - 60_000 }), 'utf-8');

    const N = 5;
    await Promise.all(Array.from({ length: N }, () => withLock(lockPath, async () => {
      const value = parseInt(readFileSync(counterPath, 'utf-8'), 10);
      await sleep(10);
      writeFileSync(counterPath, String(value + 1), 'utf-8');
    }, { staleMs: 1_000, retryMs: 10, timeoutMs: 10_000 })));

    assert.equal(readFileSync(counterPath, 'utf-8'), String(N), '并发 stale 夺锁必须保持互斥（无 lost update）');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('mutateCurrentState (R-286 锁下沉唯一变更入口)', () => {
  let mutateCurrentState;
  let readCurrentState;

  before(async () => {
    ({ mutateCurrentState, readCurrentState } = await import('../dist/utils/workspace.js'));
  });

  function mkStateWorkspace() {
    const dir = mkdtempSync(join(tmpdir(), 'dp-mutate-'));
    mkdirSync(join(dir, '.docpath', 'workspace'), { recursive: true });
    mkdirSync(join(dir, '.docpath', 'tasks', 'current'), { recursive: true });
    writeFileSync(join(dir, '.docpath', 'workspace', 'state.json'), JSON.stringify({
      level: 1,
      workflow_profile: 'standard',
      state: 'idle',
      task_id: '',
      task_title: '',
      phase: 'idle',
      gate: 'none',
      current_step: 'waiting',
      started_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    }, null, 2), 'utf-8');
    return dir;
  }

  it('serializes concurrent state mutations without lost updates', async () => {
    const dir = mkStateWorkspace();
    // N 个并发 RMW 各追加一个字符；无锁时后写覆盖先写（典型结果 < N），持锁必为 N。
    const N = 6;
    await Promise.all(Array.from({ length: N }, () =>
      mutateCurrentState(dir, (previous) => ({
        ...previous,
        task_title: `${previous?.task_title || ''}x`,
      }))));
    const final = await readCurrentState(dir);
    assert.equal(final.task_title, 'x'.repeat(N), '并发 mutate 不得丢失更新');
    rmSync(dir, { recursive: true, force: true });
  });

  it('feeds the mutator the freshest state and returns the written state', async () => {
    const dir = mkStateWorkspace();
    const first = await mutateCurrentState(dir, (previous) => ({
      ...previous,
      current_step: 'step-1',
    }));
    assert.equal(first.current_step, 'step-1');
    const second = await mutateCurrentState(dir, (previous) => ({
      ...previous,
      current_step: `${previous.current_step}+2`,
    }));
    assert.equal(second.current_step, 'step-1+2', 'mutator 必须收到上一次写入后的最新状态');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('state write boundary (R-286 AC-1)', () => {
  it('src/commands and src/hooks contain no direct writeCurrentState usage', () => {
    const repoRoot = fileURLToPath(new URL('..', import.meta.url));
    const offenders = [];
    for (const root of ['src/commands', 'src/hooks']) {
      const base = join(repoRoot, root);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { recursive: true })) {
        const rel = String(entry);
        if (!rel.endsWith('.ts')) continue;
        const content = readFileSync(join(base, rel), 'utf-8');
        if (/\bwriteCurrentState\b/.test(content)) offenders.push(`${root}/${rel}`);
      }
    }
    assert.deepEqual(offenders, [], '命令/hook 层必须经 mutateCurrentState 或 transitionWorkflow 变更状态');
  });
});
