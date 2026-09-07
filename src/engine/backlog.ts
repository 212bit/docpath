/**
 * Backlog 引擎 — 需求条目模型 + 状态机 (R-010 / FR-1, FR-2)
 *
 * 一条需求一文件：`.docpath/backlog/R-###-slug.md`（YAML frontmatter + 短正文）。
 * 条目状态机独立于执行 FSM（transitionWorkflow）——执行 FSM 管「当前任务阶段」，
 * 本状态机管「条目在需求组合中的状态」，两者仅在 promote/done 处衔接（S4/S5）。
 *
 * 写入唯一入口：writeBacklogItem()（类比 writeCurrentState）。fail-loud：非法转移抛错。
 */

import { readFile, writeFile, readdir, mkdir, rename, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveDocpathDir } from '../utils/file.js';

export type BacklogStatus = 'proposed' | 'accepted' | 'planned' | 'active' | 'done' | 'dropped';
export type BacklogPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type BacklogReadiness = 'raw' | 'shaped' | 'analyzed' | 'confirmed';
const VALID_PRIORITIES = new Set<BacklogPriority>(['P0', 'P1', 'P2', 'P3']);
const VALID_READINESS = new Set<BacklogReadiness>(['raw', 'shaped', 'analyzed', 'confirmed']);

export interface BacklogLinks {
  /** 关联任务：T-YYYYMMDD-slug 或 'current'；未 promote 时为 null */
  task: string | null;
  /** 关联 spec 路径；未 promote 时为 null */
  spec: string | null;
}

export interface BacklogEvidence {
  brainstorm: string | null;
  analysis: string | null;
  spec: string | null;
  decision_brief: string | null;
  user_confirmed: string | null;
}

export interface BacklogItem {
  /** 需求 id：R-###（单调递增） */
  id: string;
  title: string;
  status: BacklogStatus;
  priority: BacklogPriority;
  /** 复杂度 0-3 */
  level: number;
  /** 来源标注，便于追溯 */
  source: string;
  /** 需求成熟度：raw 仅捕获想法，confirmed 才可代表已确认的可执行需求 */
  readiness: BacklogReadiness;
  /** 支撑需求成熟度的可追溯证据 */
  evidence: BacklogEvidence;
  links: BacklogLinks;
  /** ISO 日期 YYYY-MM-DD */
  created_at: string;
  /** frontmatter 之后的 markdown 正文 */
  body: string;
}

// ── 合法状态转移矩阵 ──
// 主干：proposed → accepted → planned → active → done
// fast-track：proposed → active（配合 `promote --draft` 跳过成熟度门禁直达执行）
// 任意非终态 → dropped；dropped 可复活为 proposed；done 为终态。
const BACKLOG_TRANSITIONS: Record<BacklogStatus, BacklogStatus[]> = {
  proposed: ['accepted', 'active', 'dropped'],
  accepted: ['planned', 'active', 'dropped'],
  planned: ['active', 'dropped'],
  active: ['done', 'dropped'],
  done: [],
  dropped: ['proposed'],
};

const VALID_STATUSES = new Set<BacklogStatus>([
  'proposed', 'accepted', 'planned', 'active', 'done', 'dropped',
]);

export function isBacklogStatus(value: string): value is BacklogStatus {
  return VALID_STATUSES.has(value as BacklogStatus);
}

export function isBacklogPriority(value: string): value is BacklogPriority {
  return VALID_PRIORITIES.has(value as BacklogPriority);
}

export function isBacklogReadiness(value: string): value is BacklogReadiness {
  return VALID_READINESS.has(value as BacklogReadiness);
}

export function canTransitionBacklog(from: BacklogStatus, to: BacklogStatus): boolean {
  return BACKLOG_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 纯状态转移：同态幂等返回；非法转移 fail-loud 抛错（含允许目标提示）。
 */
export function transitionBacklog(from: BacklogStatus, to: BacklogStatus): BacklogStatus {
  if (from === to) return to;
  if (!canTransitionBacklog(from, to)) {
    const allowed = BACKLOG_TRANSITIONS[from]?.join(', ') || '（终态，无可转目标）';
    throw new Error(`[docpath] Illegal backlog transition: ${from} → ${to}（允许: ${allowed}）`);
  }
  return to;
}

export const transitionBacklogStatus = transitionBacklog;

// ── 文件 I/O ──

function backlogDir(docpathDir: string): string {
  return join(docpathDir, 'backlog');
}

function archivedBacklogDir(docpathDir: string): string {
  return join(docpathDir, 'backlog', 'archived');
}

/**
 * 标题转文件系统安全的 slug（R-321/FR-1，D1=Unicode 保留策略）。
 *
 * 保留中文等 unicode 字符，仅清洗文件系统非法字符 `/ \ : * ? " < > |` 与控制字符；
 * 空白与非法字符转连字符并折叠；ascii 小写；按码点截断 32 字（不劈裂代理对）；
 * 首尾去连字符；无可用字符时回退 'item'。
 * 注：id 前缀查找（findItemFile / nextBacklogId 走 `R-###` 前缀）对 unicode NFC/NFD
 * 规范化不敏感，故 slug 保留中文不影响解析。
 */
function slugify(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[/\\:*?"<>|\u0000-\u001f\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const truncated = Array.from(cleaned).slice(0, 32).join('').replace(/-+$/g, '');
  return truncated || 'item';
}

function parseItem(content: string): BacklogItem {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('[docpath] backlog 条目缺少 frontmatter');
  }
  const fm = (parseYaml(match[1]) || {}) as Record<string, unknown>;
  const id = String(fm.id ?? '');
  const title = String(fm.title ?? '');
  const status = String(fm.status ?? 'proposed');
  const priority = String(fm.priority ?? 'P2');
  const level = Number(fm.level ?? 2);
  const createdAt = String(fm.created_at ?? '');

  if (!/^R-\d+$/i.test(id)) {
    throw new Error(`[docpath] backlog 条目 id 非法: ${id || '空值'}`);
  }
  if (!title.trim()) {
    throw new Error(`[docpath] backlog 条目 ${id} 缺少 title`);
  }
  if (!isBacklogStatus(status)) {
    throw new Error(`[docpath] backlog 条目 ${id} 的 status 非法: ${status}`);
  }
  if (!isBacklogPriority(priority)) {
    throw new Error(`[docpath] backlog 条目 ${id} 的 priority 非法: ${priority}`);
  }
  if (!Number.isInteger(level) || level < 0 || level > 3) {
    throw new Error(`[docpath] backlog 条目 ${id} 的 level 非法: ${String(fm.level ?? '')}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) {
    throw new Error(`[docpath] backlog 条目 ${id} 的 created_at 非法: ${createdAt || '空值'}`);
  }
  const links = (fm.links ?? {}) as Record<string, unknown>;
  const body = (match[2] || '').trim();
  const parsedLinks = {
    task: links.task != null ? String(links.task) : null,
    spec: links.spec != null ? String(links.spec) : null,
  };
  return {
    id,
    title: title.trim(),
    status,
    priority,
    level,
    source: String(fm.source ?? ''),
    readiness: normalizeReadiness(fm.readiness, status, body, parsedLinks),
    evidence: normalizeEvidence(fm.evidence, parsedLinks),
    links: parsedLinks,
    created_at: createdAt,
    body,
  };
}

function normalizeReadiness(
  value: unknown,
  status: string,
  body: string,
  links: BacklogLinks,
): BacklogReadiness {
  if (typeof value === 'string' && isBacklogReadiness(value)) return value;
  if (containsPlaceholderLine(body)) return 'raw';
  if ((status === 'active' || status === 'done') && links.spec) return 'analyzed';
  return body.trim() ? 'shaped' : 'raw';
}

function normalizeEvidence(value: unknown, links: BacklogLinks): BacklogEvidence {
  const evidence = (value ?? {}) as Record<string, unknown>;
  return {
    brainstorm: stringOrNull(evidence.brainstorm),
    analysis: stringOrNull(evidence.analysis),
    spec: stringOrNull(evidence.spec) ?? links.spec,
    decision_brief: stringOrNull(evidence.decision_brief),
    user_confirmed: stringOrNull(evidence.user_confirmed),
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function containsPlaceholderLine(body: string): boolean {
  return body
    .split('\n')
    .some((line) => /^\s*(?:[-*]\s*)?(?:待补充|暂无|无|none|n\/a|tbd|todo)\s*$/i.test(line.trim()));
}

function serializeItem(item: BacklogItem): string {
  const frontmatter = stringifyYaml({
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    level: item.level,
    source: item.source,
    readiness: item.readiness,
    evidence: item.evidence,
    links: { task: item.links.task, spec: item.links.spec },
    created_at: item.created_at,
  }).trim();
  return `---\n${frontmatter}\n---\n\n${item.body.trim()}\n`;
}

function comparePriority(a: BacklogPriority, b: BacklogPriority): number {
  return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
}

function generateBacklogIndexMd(items: BacklogItem[]): string {
  const activeItems = items.filter((item) => item.status !== 'done');
  const lines: string[] = [
    '# DocPath Backlog Index',
    '',
    '> 自动生成，供 agent / 人类稳定读取。',
    '',
    `> 扫描时间: ${new Date().toISOString()}`,
    '',
    '## 条目列表',
    '',
    '| id | title | status | priority | level | task |',
    '|----|-------|--------|----------|-------|------|',
  ];

  for (const item of activeItems) {
    lines.push(
      `| ${item.id} | ${item.title.replace(/\|/g, '\\|')} | ${item.status} | ${item.priority} | ${item.level} | ${item.links.task ?? ''} |`
    );
  }

  lines.push('');
  lines.push('## 用途说明');
  lines.push('');
  lines.push('- `id`: backlog 条目标识（R-###）');
  lines.push('- `status`: proposed|accepted|planned|active|done|dropped');
  lines.push('- `priority`: P0 最高，P3 最低');
  lines.push('- `task`: 已 promote 后关联的 task id；未关联为空');
  lines.push('- **done 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中');
  lines.push('');

  return lines.join('\n');
}

/** 找到 id 对应的现有文件名（保留既有 slug，避免重命名/重复）；不存在返回 null */
async function findItemFile(dir: string, id: string): Promise<string | null> {
  if (!existsSync(dir)) return null;
  const entries = await readdir(dir);
  return entries.find((f) => f === `${id}.md` || f.startsWith(`${id}-`)) ?? null;
}

function parseBacklogNumber(id: string): number {
  const n = parseInt(id.replace(/^R-/i, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function formatBacklogId(number: number): string {
  return `R-${String(number).padStart(3, '0')}`;
}

/**
 * 并发容错读取（R-321）：createBacklogItem 占号后会把裸名 R-###.md 瞬时 rename 成
 * R-###-slug.md，扫描窗口内文件可能已消失；对 ENOENT 返回 null 由调用方跳过，而非崩溃。
 */
async function readFileOrSkip(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 列出所有 backlog 条目（按 id 升序）。目录缺失时返回 []，不报错。
 */
export async function listBacklogItems(cwd: string): Promise<BacklogItem[]> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const items: BacklogItem[] = [];
  for (const file of entries) {
    if (!file.endsWith('.md') || file === 'backlog.md') continue;
    if (!/^R-\d+/i.test(file)) continue;
    const content = await readFileOrSkip(join(dir, file));
    if (content === null) continue;
    items.push(parseItem(content));
  }
  return items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * 读取单条；不存在返回 null（不报错）。
 */
export async function readBacklogItem(cwd: string, id: string): Promise<BacklogItem | null> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  const file = await findItemFile(dir, id);
  if (!file) return null;
  return parseItem(await readFile(join(dir, file), 'utf-8'));
}

/**
 * 写入单条（唯一写入口）。保留既有文件名的 slug；新条目用 `${id}-${slug(title)}.md`。
 */
export async function writeBacklogItem(cwd: string, item: BacklogItem): Promise<void> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  await mkdir(dir, { recursive: true });
  const existing = await findItemFile(dir, item.id);
  const fileName = existing ?? `${item.id}-${slugify(item.title)}.md`;
  await writeFile(join(dir, fileName), serializeItem(item), 'utf-8');
  await refreshBacklogIndex(cwd);
}

/**
 * 原子创建新条目，文件名带标题 slug（R-321/FR-1）：`R-###-<slug>.md`，ls 即可辨识。
 *
 * 分三步保证 id 唯一 + 自描述命名：
 * 1. `wx` 独占裸名 `${id}.md` 作为 per-id 原子锁——并发进程命中同一 id 必 EEXIST 后递增重试。
 *    不用带 slug 的名占号，否则「同 id 不同标题」会生成不同文件名而双双写成功，破坏 id 唯一性。
 * 2. 占号成功后复检是否已有同 id 的 slug 兄弟文件（极窄并发窗口下另一进程可能已占号并改名，
 *    或 worktree 号池 stale）；命中则释放裸锁、递增重试，杜绝撞号。
 * 3. 复检通过后把裸锁重命名为自描述 slug 名。
 */
export async function createBacklogItem(cwd: string, item: Omit<BacklogItem, 'id'>): Promise<BacklogItem> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  await mkdir(dir, { recursive: true });

  let next = parseBacklogNumber(await nextBacklogId(cwd));
  while (true) {
    const id = formatBacklogId(next);
    const candidate: BacklogItem = { ...item, id };
    const reservedFileName = `${id}.md`;
    try {
      const reservedPath = join(dir, reservedFileName);
      await writeFile(reservedPath, serializeItem(candidate), { encoding: 'utf-8', flag: 'wx' });
      const entries = await readdir(dir);
      const hasSluggedSibling = entries.some(
        (f) => f !== reservedFileName && f.startsWith(`${id}-`) && f.endsWith('.md'),
      );
      if (hasSluggedSibling) {
        await rm(reservedPath);
        next += 1;
        continue;
      }
      const finalFileName = `${id}-${slugify(item.title)}.md`;
      await rename(reservedPath, join(dir, finalFileName));
      await refreshBacklogIndex(cwd);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      next += 1;
    }
  }
}

/**
 * worktree 内解析主 checkout 的 .docpath（R-273/FR-3 id 单池）。
 * 经 git rev-parse --git-common-dir 定位主 .git，不依赖 .worktrees/ 路径约定；
 * 非 git 仓、解析失败或主 checkout 无 .docpath 时返回 null（回退现行为）。
 */
function resolveMainCheckoutDocpathDir(cwd: string): string | null {
  try {
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!gitCommonDir) return null;
    const absGitDir = isAbsolute(gitCommonDir) ? gitCommonDir : resolve(cwd, gitCommonDir);
    const candidate = join(dirname(absGitDir), '.docpath');
    return existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * 分配下一个 R-### id（基于现有条目最大编号 +1，3 位补零）。
 *
 * R-273/FR-3：worktree 的本地 backlog 副本可能 stale，同时扫描主 checkout 的
 * backlog/ 与 archived/ 取全局 max，避免基于旧快照分配出与 main 撞号的 id。
 * 边界：跨 checkout 同时 capture 的原子性不在此保证（wx 预留仅锁本 checkout）。
 */
export async function nextBacklogId(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dirs = [backlogDir(docpathDir), archivedBacklogDir(docpathDir)];

  const mainDocpathDir = resolveMainCheckoutDocpathDir(cwd);
  if (mainDocpathDir && resolve(mainDocpathDir) !== resolve(docpathDir)) {
    dirs.push(backlogDir(mainDocpathDir), archivedBacklogDir(mainDocpathDir));
  }

  let max = 0;

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    for (const file of entries) {
      if (!file.endsWith('.md') || file === 'backlog.md') continue;
      const match = file.match(/^R-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }

  return formatBacklogId(max + 1);
}

/**
 * 生成 backlog.md 机器可读索引。
 * 按 priority 升序（P0→P3），同优先级内按 id 升序排序。
 */
export async function refreshBacklogIndex(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = backlogDir(docpathDir);
  const archivedDir = archivedBacklogDir(docpathDir);
  await mkdir(dir, { recursive: true });
  await mkdir(archivedDir, { recursive: true });

  const items = await listBacklogItems(cwd);

  // Archive done items before building index
  const doneItems = items.filter((item) => item.status === 'done');
  for (const item of doneItems) {
    const filename = await findItemFile(dir, item.id);
    if (filename) {
      const sourcePath = join(dir, filename);
      const targetPath = join(archivedDir, filename);
      // `!existsSync(targetPath)` 是有意的撞号安全阀（R-321/FR-2）：archived 已有同名副本时
      // 拒绝覆盖——历史上 worktree 号池 stale 会让同 id 落在两条不同需求上（R-273 前残留），
      // 覆盖会销毁其中一条。此类「静默跳过」由 detectBacklogIdCollisions / `backlog groom`
      // 非破坏性暴露；真正的 id 重分配须走独立迁移条目，勿在此自动改数据。
      if (existsSync(sourcePath) && !existsSync(targetPath)) {
        await rename(sourcePath, targetPath);
      }
    }
  }

  // Rebuild active items list after archival
  const activeItems = items.filter((item) => item.status !== 'done');
  const sorted = [...activeItems].sort((a, b) => {
    const priorityOrder = comparePriority(a.priority, b.priority);
    if (priorityOrder !== 0) return priorityOrder;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  await writeFile(join(dir, 'backlog.md'), generateBacklogIndexMd(sorted), 'utf-8');
}

/** active 与 archived 同 id 并存的一起撞号（R-321/FR-2 非破坏性检测结果）。 */
export interface BacklogIdCollision {
  id: string;
  active_file: string;
  archived_file: string;
  active_title: string;
  archived_title: string;
  /** 两侧内容是否字节一致（一致=可能真陈旧副本；不一致=两条不同需求撞号，绝不可覆盖） */
  identical: boolean;
}

function frontmatterTitle(content: string): string {
  const match = content.match(/^title:\s*(.+)$/m);
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : '';
}

/**
 * 检测 active 与 archived 目录中同 id 并存的条目（R-321/FR-2：非破坏性撞号检测）。
 *
 * 只报告、不改数据：把 refreshBacklogIndex 归档时的「静默跳过」显式暴露给 `backlog groom`。
 * 真正的 id 重分配（数据迁移）须走独立条目，因其会牵动 links.task/links.spec 与历史引用。
 */
export async function detectBacklogIdCollisions(cwd: string): Promise<BacklogIdCollision[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = backlogDir(docpathDir);
  const adir = archivedBacklogDir(docpathDir);
  if (!existsSync(dir) || !existsSync(adir)) return [];

  const idOf = (file: string): string => file.match(/^(R-\d+)/i)?.[1]?.toUpperCase() ?? '';
  const isItemFile = (file: string): boolean => /^R-\d+.*\.md$/i.test(file) && file !== 'backlog.md';

  const archivedById = new Map<string, string>();
  for (const file of await readdir(adir)) {
    if (!isItemFile(file)) continue;
    const id = idOf(file);
    if (id && !archivedById.has(id)) archivedById.set(id, file);
  }

  const collisions: BacklogIdCollision[] = [];
  for (const file of await readdir(dir)) {
    if (!isItemFile(file)) continue;
    const id = idOf(file);
    const archivedFile = id ? archivedById.get(id) : undefined;
    if (!archivedFile) continue;
    const activeContent = await readFileOrSkip(join(dir, file));
    const archivedContent = await readFileOrSkip(join(adir, archivedFile));
    if (activeContent === null || archivedContent === null) continue;
    collisions.push({
      id,
      active_file: `backlog/${file}`,
      archived_file: `backlog/archived/${archivedFile}`,
      active_title: frontmatterTitle(activeContent),
      archived_title: frontmatterTitle(archivedContent),
      identical: activeContent === archivedContent,
    });
  }

  return collisions.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/**
 * 读取 → 转移 → 写回（组合 FSM 与 I/O 的单一入口）。
 * 条目不存在或非法转移时 fail-loud 抛错。返回更新后的条目。
 */
export async function setBacklogStatus(cwd: string, id: string, to: BacklogStatus): Promise<BacklogItem> {
  const item = await readBacklogItem(cwd, id);
  if (!item) {
    throw new Error(`[docpath] backlog 条目不存在: ${id}`);
  }
  item.status = transitionBacklog(item.status, to);
  await writeBacklogItem(cwd, item);
  return item;
}
