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

/** 读取锁文件原始内容；不存在返回 null。 */
async function readLockRaw(lockPath: string): Promise<string | null> {
  try {
    return await readFile(lockPath, 'utf-8');
  } catch {
    return null;
  }
}

/** 解析锁记录；null/损坏返回 null。 */
function parseLockRecord(raw: string | null): LockRecord | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as LockRecord;
  } catch {
    return null;
  }
}

/** 读取并解析锁记录；不存在/损坏返回 null。 */
async function readLockRecord(lockPath: string): Promise<LockRecord | null> {
  return parseLockRecord(await readLockRaw(lockPath));
}

/** 对已读取的记录做 stale 判定（损坏视为可回收）。 */
function isStaleRecord(record: LockRecord | null, staleMs: number): boolean {
  if (!record) return true;
  if (typeof record.ts !== 'number' || Date.now() - record.ts > staleMs) return true;
  if (!isProcessAlive(record.pid)) return true;
  return false;
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
 * 原子夺取 stale 锁（R-293/R-296）：
 * - 直接 unlink 会双删——两个等待者都判定 stale 时，后 unlink 的会删掉先获锁者
 *   刚创建的新锁（unlink 按路径不按 inode）→ 双持有。rename 对同一路径原子。
 * - 判定与执行之间锁可能已易主（R-296 TOCTOU）：紧邻 rename 前按原始内容复核；
 *   rename 后再核对改走的内容，发现误夺活锁则按原文恢复（保 token，原持有者的
 *   tenure 复核可确认在位）。恢复被第三方抢先属三重巧合微秒窗口，由获锁方的
 *   tenure 复核兜底。
 */
async function takeoverStaleLock(lockPath: string, token: string, judgedRaw: string): Promise<void> {
  if (await readLockRaw(lockPath) !== judgedRaw) return; // 判定已过期，放弃夺锁
  const stalePath = `${lockPath}.stale-${token}`;
  try {
    await rename(lockPath, stalePath);
  } catch {
    return; // 已被他人夺取或释放，回到重试循环
  }
  const takenRaw = await readLockRaw(stalePath);
  if (takenRaw !== null && takenRaw !== judgedRaw) {
    // 误夺易主后的活锁：按原始内容恢复
    try {
      await writeFile(lockPath, takenRaw, { encoding: 'utf-8', flag: 'wx' });
    } catch {
      // 第三方已抢入空位——由其与原持有者的 tenure 复核收敛
    }
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
  // 本次获锁过程中是否见过 stale 记录：只有 stale 争夺场景才存在误夺/失位风险，
  // 常态获锁跳过 tenure 复核保持零开销（R-296）。
  let sawStale = false;

  let acquired = false;
  while (!acquired) {
    if (await tryAcquire(lockPath, token)) {
      if (!sawStale) {
        acquired = true;
        break;
      }
      // tenure 复核（R-296）：stale 争夺期间，基于旧判定的夺锁可能在获锁瞬间
      // 改走本锁；短暂 jitter 后确认锁仍属于自己才算真正持有。
      await sleep(2 + Math.floor(Math.random() * 4));
      const holder = parseLockRecord(await readLockRaw(lockPath));
      if (holder?.token === token) {
        acquired = true;
        break;
      }
      continue; // 失位：回到竞争循环
    }
    // 锁被占用：按同一次读取的原始内容判定 stale，可回收则原子夺锁后立即重试。
    const raw = await readLockRaw(lockPath);
    if (raw === null) continue; // 读取瞬间已被释放，立即重试
    if (isStaleRecord(parseLockRecord(raw), staleMs)) {
      sawStale = true;
      await takeoverStaleLock(lockPath, token, raw);
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
