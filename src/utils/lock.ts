/**
 * 进程间互斥锁 — 防止并发 Agent（codex / hive 守护进程 / 人类）对状态文件
 * 做 read-modify-write 时发生 lost update。
 *
 * 复用 backlog.ts 已验证的 `flag:'wx'` 原子独占创建模式：
 *   - writeFile(lockPath, ..., {flag:'wx'}) 在文件已存在时抛 EEXIST，
 *     从而把「创建锁文件」变成一个不可分割的获锁操作。
 *
 * stale 锁判定（双重保险）：
 *   1. 时间戳：锁持有超过 STALE_MS 视为陈旧（防止持有者崩溃后死锁）。
 *   2. PID 存活探测：process.kill(pid, 0) —— 持有进程已不存在则锁可抢占。
 *
 * 设计取舍（见任务 spec）：fail-loud —— 总超时后抛错而非静默放弃，
 * 符合 DocPath「宁可报错也不漂移」的纪律。
 */

import { writeFile, readFile, unlink, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface LockOptions {
  /** 自旋总超时（毫秒），超过即放弃并抛错 */
  timeoutMs?: number;
  /** 每次重试间隔（毫秒） */
  retryMs?: number;
  /** 锁持有超过此时长（毫秒）即视为 stale 可抢占 */
  staleMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRY_MS = 50;
const DEFAULT_STALE_MS = 30_000;

interface LockRecord {
  pid: number;
  ts: number;
  /** 属主标识（R-293）：释放/夺锁校验用，防止按路径误删他人锁。旧格式无此字段，按 pid 回退。 */
  token?: string;
}

/** 读取并解析锁记录；不存在/损坏返回 null。 */
async function readLockRecord(lockPath: string): Promise<LockRecord | null> {
  try {
    return JSON.parse(await readFile(lockPath, 'utf-8')) as LockRecord;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 进程是否存活：kill(pid,0) 不发信号，仅做存在性探测。ESRCH=不存在；EPERM=存在但无权限。 */
function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * 判断一个已存在的锁是否可被抢占。
 * 读不到 / 解析失败的锁文件视为损坏 → 可抢占（保守地认为持有者已异常退出）。
 */
async function isLockStale(lockPath: string, staleMs: number): Promise<boolean> {
  const record = await readLockRecord(lockPath);
  // 读取期间锁被释放，或锁文件损坏 → 视为可获取
  if (!record) return true;
  if (typeof record.ts !== 'number' || Date.now() - record.ts > staleMs) return true;
  if (!isProcessAlive(record.pid)) return true;
  return false;
}

/** 尝试原子获锁；成功返回 true。已存在返回 false；其它错误抛出。 */
async function tryAcquire(lockPath: string, token: string): Promise<boolean> {
  const record: LockRecord = { pid: process.pid, ts: Date.now(), token };
  try {
    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(lockPath, JSON.stringify(record), { encoding: 'utf-8', flag: 'wx' });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

/**
 * 原子夺取 stale 锁（R-293）：直接 unlink 会双删——两个等待者都判定 stale 时，
 * 后 unlink 的会删掉先获锁者刚创建的新锁（unlink 按路径不按 inode）→ 双持有。
 * rename 对同一路径原子，仅一个等待者成功改走旧锁；失败者直接回到重试循环。
 */
async function takeoverStaleLock(lockPath: string, token: string): Promise<void> {
  const stalePath = `${lockPath}.stale-${token}`;
  try {
    await rename(lockPath, stalePath);
  } catch {
    return; // 已被他人夺取或释放，回到重试循环
  }
  try {
    await unlink(stalePath);
  } catch {
    // 清理失败不影响互斥
  }
}

/**
 * 属主校验释放（R-293）：token 匹配（旧格式无 token 按 pid 回退）才 unlink。
 * 自己持锁超 staleMs 被抢占重建后，无校验的 unlink 会误删新持有者的锁。
 * read-match-unlink 间仍有极小 TOCTOU 窗口（仅在持锁超期且恰在两步之间被
 * 抢占时触发），相比无校验已从常态缩为双重罕见事件。
 */
async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  const record = await readLockRecord(lockPath);
  if (!record) return; // 已被释放/抢占
  const owned = record.token ? record.token === token : record.pid === process.pid;
  if (!owned) return; // 锁已易主，绝不误删他人锁
  try {
    await unlink(lockPath);
  } catch {
    // 竞态释放，忽略
  }
}

/**
 * 在持有 `lockPath` 互斥锁的前提下执行 `fn`。
 *
 * 获锁失败时自旋重试，直到成功或超时。检测到 stale 锁会尝试抢占。
 * `fn` 抛错时锁仍会被释放（finally）。
 *
 * @throws 总超时仍无法获锁，或底层文件系统错误。
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const deadline = Date.now() + timeoutMs;
  const token = randomUUID();

  let acquired = false;
  while (!acquired) {
    if (await tryAcquire(lockPath, token)) {
      acquired = true;
      break;
    }
    // 锁被占用：检查是否 stale，可抢占则原子夺锁后立即重试。
    if (await isLockStale(lockPath, staleMs)) {
      await takeoverStaleLock(lockPath, token);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `[docpath] 获取状态锁超时（${timeoutMs}ms）：${lockPath} 被其它进程持有。` +
        `若确认无并发 Agent，可手动删除该锁文件后重试。`,
      );
    }
    await sleep(retryMs);
  }

  try {
    return await fn();
  } finally {
    await releaseOwnedLock(lockPath, token);
  }
}
