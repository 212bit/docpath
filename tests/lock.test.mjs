import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

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
