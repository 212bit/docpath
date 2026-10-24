/**
 * backlog 跨 worktree 共享注册表（R-356，方案 B）。
 *
 * 背景：`.docpath/backlog/` 在 worktree 模型下是 merge-mediated 快照（R-238 Option B /
 * R-273 资源分层），可 stale；`scanBacklogMaxId` 与 `detectBacklogDuplicates` 原先只扫
 * 「本 checkout + 主 checkout」，兄弟 worktree 不可见 → 并行 capture 时产生结构性重复
 * 登记与 id 撞号。
 *
 * 本模块提供**跨 worktree 共享、gitignored** 的注册表：
 *   - 落点：`<git-common-dir>/docpath-backlog-registry.json`。`.git` 在同一仓库的所有
 *     worktree 间天然共享（`git rev-parse --git-common-dir`），且不被 git 当作跟踪文件，
 *     不触发「symlink 跟踪目录 → mass deletion」的既有坑。
 *   - 用途：记录 `id → 登记它的 worktree`、`title → id`，让任一会话在 capture/登记时
 *     感知兄弟 worktree 已存在的同 id / 同标题。
 *
 * 语义边界（用户 2026-09-23 裁定）：
 *   - 可见性下限 = capture 时（点时刻）可见，不做后台实时推送（不引入 watcher/daemon）。
 *   - 不推翻 R-238/R-273：各 worktree 仍持有自己的 merge-mediated backlog，合并回 main
 *     照旧 reconcile；本注册表只是**哨兵**，用于跨实例探测，不是 backlog 真源。
 *   - 注册表损坏/不可读时 fail-open（返回空视图），不阻断 capture 主流程——
 *     真正的兜底仍是「实时扫兄弟 worktree」。
 */

import { runToolSyncOrThrow } from './run-tool.js';

function gitText(cwd: string, args: string[]): string {
  return runToolSyncOrThrow('git', args, {
    cwd,
    timeoutMs: 30_000,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'ignore',
    offline: false,
  });
}
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** 注册表条目：某个 backlog id / title 的登记来源。 */
export interface BacklogRegistryEntry {
  id: string;
  title: string;
  /** 登记它的 worktree 路径（绝对）。 */
  worktree: string;
  /** 登记时间戳（ISO）。 */
  registered_at: string;
}

interface BacklogRegistryFile {
  version: 1;
  entries: BacklogRegistryEntry[];
  updated_at: string;
}

const REGISTRY_FILENAME = 'docpath-backlog-registry.json';

/**
 * 解析共享 git 目录（`git rev-parse --git-common-dir`），失败/非 git 仓返回 null。
 * 注意：worktree 内 `--git-dir` 指向 `<repo>/.git/worktrees/<name>`，而
 * `--git-common-dir` 才指向所有 worktree 共享的 `<repo>/.git`。
 */
export function resolveSharedGitDir(cwd: string): string | null {
  try {
    const out = gitText(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim();
    if (!out) return null;
    return isAbsolute(out) ? out : resolve(cwd, out);
  } catch {
    // `--path-format` 属 git 2.31+；旧版本回退到相对路径解析
    try {
      const out = gitText(cwd, ['rev-parse', '--git-common-dir']).trim();
      if (!out) return null;
      return isAbsolute(out) ? out : resolve(cwd, out);
    } catch {
      return null;
    }
  }
}

/** 注册表文件绝对路径；非 git 仓返回 null（调用方回退现行为）。 */
export function backlogRegistryPath(cwd: string): string | null {
  const gitDir = resolveSharedGitDir(cwd);
  if (!gitDir) return null;
  return join(gitDir, REGISTRY_FILENAME);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 清理 Backlog 标题（R-368/治理，R-422 修复）：去除前置冗余标记（P0/P1/P2/P3、[dropped]、[done] 等）。
 * 仅在提供 selfId 且标题以自身的 ID 开头时剥离该 ID，避免误杀标题中引用的外部需求号（如 R-093）。
 */
export function cleanBacklogTitle(raw: string, selfId?: string): string {
  let title = (raw || '').trim();
  let changed = true;
  const selfPrefixPattern = selfId?.trim()
    ? new RegExp(
        `^(?:\\[\\s*${escapeRegExp(selfId.trim())}\\s*\\]|\\(\\s*${escapeRegExp(selfId.trim())}\\s*\\)|${escapeRegExp(selfId.trim())}[\\s:：\\-—]+)\\s*`,
        'i',
      )
    : null;

  while (changed) {
    const prev = title;
    if (selfPrefixPattern) {
      title = title.replace(selfPrefixPattern, '');
    }
    title = title.replace(
      /^(?:\[\s*(?:P[0-3]|proposed|accepted|planned|active|done|dropped)\s*\]|\(\s*(?:P[0-3]|proposed|accepted|planned|active|done|dropped)\s*\)|(?:P[0-3])[\s:：\-—]+)\s*/i,
      '',
    );
    changed = title !== prev;
  }
  return title.trim() || raw.trim();
}

function normalizeTitle(title: string): string {
  return cleanBacklogTitle(title)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function asEntry(value: unknown): BacklogRegistryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const worktree = typeof raw.worktree === 'string' ? raw.worktree.trim() : '';
  const registeredAt = typeof raw.registered_at === 'string' ? raw.registered_at.trim() : '';
  if (!/^R-\d+$/i.test(id) || !worktree) return null;
  return {
    id: id.toUpperCase(),
    title,
    worktree,
    registered_at: registeredAt || new Date(0).toISOString(),
  };
}

/**
 * 读取注册表。fail-open：文件缺失/损坏/无共享 git 目录时返回空条目表，
 * 绝不因注册表问题阻断 capture 主流程。
 */
export async function readBacklogRegistry(cwd: string): Promise<BacklogRegistryEntry[]> {
  const path = backlogRegistryPath(cwd);
  if (!path || !existsSync(path)) return [];
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as Partial<BacklogRegistryFile>;
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return entries.map(asEntry).filter((entry): entry is BacklogRegistryEntry => entry !== null);
  } catch {
    return [];
  }
}

/** 原子写注册表（临时文件 + rename，避免并发/崩溃留半写）。 */
async function writeBacklogRegistry(cwd: string, entries: BacklogRegistryEntry[]): Promise<boolean> {
  const path = backlogRegistryPath(cwd);
  if (!path) return false;
  const payload: BacklogRegistryFile = {
    version: 1,
    entries,
    updated_at: new Date().toISOString(),
  };
  try {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    await rename(tmp, path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 登记一条 backlog 条目（id + title + 来源 worktree）。同 id 已存在时以最新 title/worktree 覆盖
 * （条目可能被 edit）。写失败静默（fail-open）。
 */
export async function registerBacklogEntry(
  cwd: string,
  entry: { id: string; title: string; worktree?: string },
): Promise<void> {
  const id = entry.id.trim().toUpperCase();
  if (!/^R-\d+$/i.test(id)) return;
  const existing = await readBacklogRegistry(cwd);
  const worktree = entry.worktree?.trim() || process.cwd();
  const next = existing.filter((item) => item.id !== id);
  next.push({
    id,
    title: entry.title.trim(),
    worktree,
    registered_at: new Date().toISOString(),
  });
  next.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  await writeBacklogRegistry(cwd, next);
}

/** 注册表视图：某 id 是否已被（任意 worktree）登记。 */
export async function findRegistryIdHolders(
  cwd: string,
  id: string,
): Promise<BacklogRegistryEntry[]> {
  const needle = id.trim().toUpperCase();
  return (await readBacklogRegistry(cwd)).filter((entry) => entry.id === needle);
}

/** 注册表视图：是否有（任意 worktree）已登记同标题条目。 */
export async function findRegistryTitleHolders(
  cwd: string,
  title: string,
): Promise<BacklogRegistryEntry[]> {
  const needle = normalizeTitle(title);
  if (!needle) return [];
  return (await readBacklogRegistry(cwd)).filter((entry) => normalizeTitle(entry.title) === needle);
}

/**
 * 枚举本仓库所有 worktree 的 `.docpath` 目录（去重，含主 checkout）。
 * 非 git 仓/枚举失败返回空数组（调用方回退到既有的「本 + 主 checkout」行为）。
 */
export function listWorktreeDocpathDirs(cwd: string): string[] {
  try {
    const out = gitText(cwd, ['worktree', 'list', '--porcelain']);
    const dirs: string[] = [];
    const seen = new Set<string>();
    for (const line of out.split('\n')) {
      if (!line.startsWith('worktree ')) continue;
      const wtPath = line.slice('worktree '.length).trim();
      if (!wtPath) continue;
      const docpathDir = join(wtPath, '.docpath');
      const key = resolve(docpathDir);
      if (seen.has(key)) continue;
      seen.add(key);
      if (existsSync(docpathDir)) dirs.push(docpathDir);
    }
    return dirs;
  } catch {
    return [];
  }
}
