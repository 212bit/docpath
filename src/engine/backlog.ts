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
import {
  cleanBacklogTitle,
  findRegistryIdHolders,
  findRegistryTitleHolders,
  listWorktreeDocpathDirs,
  readBacklogRegistry,
  registerBacklogEntry,
} from '../utils/backlog-registry.js';

export { cleanBacklogTitle };

export type BacklogStatus = 'proposed' | 'accepted' | 'planned' | 'active' | 'done' | 'dropped';
export type BacklogPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type BacklogReadiness = 'raw' | 'shaped' | 'analyzed' | 'confirmed';
export type BacklogKind = 'feature' | 'fix' | 'refactor' | 'perf' | 'debt' | 'spike' | 'chore';
const VALID_PRIORITIES = new Set<BacklogPriority>(['P0', 'P1', 'P2', 'P3']);
const VALID_READINESS = new Set<BacklogReadiness>(['raw', 'shaped', 'analyzed', 'confirmed']);
const VALID_KINDS = new Set<BacklogKind>(['feature', 'fix', 'refactor', 'perf', 'debt', 'spike', 'chore']);

export function isBacklogKind(value: string): value is BacklogKind {
  return VALID_KINDS.has(value.toLowerCase().trim() as BacklogKind);
}

export interface BacklogLinks {
  /** 关联任务：T-YYYYMMDD-slug 或 'current'；未 promote 时为 null */
  task: string | null;
  /** 关联 spec 路径；未 promote 时为 null */
  spec: string | null;
  /** 父级需求 ID（例如 R-100） */
  parent?: string | null;
  /** 依赖的前置需求列表（例如 ['R-101', 'R-102']） */
  depends_on?: string[];
  /** 阻塞的后置需求列表（例如 ['R-105']） */
  blocks?: string[];
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
  kind?: BacklogKind;
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

/**
 * 为不同类型需求生成标准四段式结构化 Markdown 正文
 */
export function generateBacklogItemBody(
  kind: BacklogKind,
  title: string,
  options?: {
    background?: string;
    acceptance?: string;
    fr?: string;
    nonGoals?: string;
  },
): string {
  const bg = options?.background?.trim();
  const ac = options?.acceptance?.trim();
  const fr = options?.fr?.trim();
  const nonGoals = options?.nonGoals?.trim();

  switch (kind) {
    case 'fix':
      return [
        '## 1. 缺陷背景与影响',
        bg ? `- **现象描述**: ${bg}` : '- **现象描述**: 待补充\n- **复现步骤**: 1. 待补充\n- **影响范围**: 待补充',
        '',
        '## 2. 根因分析与修复方案',
        '- **根本原因**: 待分析',
        '- **修复思路**: 待补充',
        '',
        '## 3. 严格验收标准',
        ac ? `- [AC-1] ${ac}` : '- [AC-1] 复现步骤不再异常抛错\n- [AC-2] 新增单元测试/回归测试验证边界',
        '',
        '## 4. 边界与约束',
        nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- 不引入破坏性 API 变更',
      ].join('\n');

    case 'perf':
      return [
        '## 1. 性能现状与基准',
        bg ? `- **现状描述**: ${bg}` : '- **基准测试数据**: 待补充\n- **性能瓶颈**: 待分析',
        '',
        '## 2. 优化方案',
        '- **优化思路**: 待补充',
        '',
        '## 3. 严格验收标准',
        ac ? `- [AC-1] ${ac}` : '- [AC-1] 达到目标性能指标\n- [AC-2] 基准测试通过且无功能回退',
        '',
        '## 4. 边界与约束',
        nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- 内存与 CPU 资源占用符合预期',
      ].join('\n');

    case 'spike':
      return [
        '## 1. 调研目标与核心问题',
        bg ? `- **调研背景**: ${bg}` : '- **待解技术疑难**: 待补充\n- **调研范围**: 待补充',
        '',
        '## 2. 调研要点与候选方案',
        '- **候选方案**: 待对比分析',
        '',
        '## 3. 严格验收标准',
        ac ? `- [AC-1] ${ac}` : '- [AC-1] 产出技术评估报告或 ADR\n- [AC-2] 明确可行性结论与潜在风险',
        '',
        '## 4. 边界与约束',
        nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- 仅限技术调研与原型验证，不直接合并生产代码',
      ].join('\n');

    case 'refactor':
    case 'debt':
      return [
        '## 1. 重构动因与技术债现状',
        bg ? `- **动因描述**: ${bg}` : '- **维护痛点 / 代码异味**: 待补充\n- **预期收益**: 待补充',
        '',
        '## 2. 重构范围与模块',
        fr ? `- [FR-1] ${fr}` : '- **涉及模块**: 待明确',
        '',
        '## 3. 严格验收标准',
        ac ? `- [AC-1] ${ac}` : '- [AC-1] 保持原有外部行为和契约 100% 兼容\n- [AC-2] 现有测试套件全部绿色通过',
        '',
        '## 4. 边界与约束',
        nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- **Non-Goals**: 严禁在重构中夹带未经评审的新功能',
      ].join('\n');

    case 'feature':
    case 'chore':
    default:
      return [
        '## 1. 背景与业务价值',
        bg ? `- **现状与痛点**: ${bg}` : '- **现状与痛点**: 待补充\n- **预期收益**: 待补充',
        '',
        '## 2. 核心功能要点',
        fr ? `- [FR-1] ${fr}` : `- [FR-1] ${title}`,
        '',
        '## 3. 严格验收标准',
        ac ? `- [AC-1] ${ac}` : '- [AC-1] 满足功能需求并通过门禁',
        '',
        '## 4. 边界与约束',
        nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- **Non-Goals**: 待补充',
        '- **架构约束**: 遵循既定架构规范与无冗余门禁',
      ].join('\n');
  }
}

// ── 合法状态转移矩阵 ──
// 主干：proposed → accepted → planned → active → done
// fast-track：proposed → active（配合 `promote --draft` 跳过成熟度门禁直达执行）
// 旁路终态（R-346）：非终态 → done 也接受"已被 quick 等旁路闭环"的条目，但矩阵本身
// 保持纯净——任务证据（links.task 非空 + 任务目录存在）由 setBacklogStatus 统一校验。
// 任意非终态 → dropped；dropped 可复活为 proposed；done 为终态。
const BACKLOG_TRANSITIONS: Record<BacklogStatus, BacklogStatus[]> = {
  proposed: ['accepted', 'active', 'dropped', 'done'],
  accepted: ['planned', 'active', 'dropped', 'done'],
  planned: ['active', 'dropped', 'done'],
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
  const parsedDependsOn = Array.isArray(links.depends_on)
    ? links.depends_on.map(String)
    : Array.isArray(links.dependsOn)
      ? links.dependsOn.map(String)
      : (typeof links.depends_on === 'string' ? links.depends_on.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined);
  const parsedBlocks = Array.isArray(links.blocks)
    ? links.blocks.map(String)
    : (typeof links.blocks === 'string' ? links.blocks.split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean) : undefined);
  const parsedLinks: BacklogLinks = {
    task: links.task != null ? String(links.task) : null,
    spec: links.spec != null ? String(links.spec) : null,
    parent: links.parent != null ? String(links.parent) : null,
    ...(parsedDependsOn && parsedDependsOn.length > 0 ? { depends_on: parsedDependsOn } : {}),
    ...(parsedBlocks && parsedBlocks.length > 0 ? { blocks: parsedBlocks } : {}),
  };
  const rawKind = String(fm.kind ?? '').toLowerCase().trim();
  const kind: BacklogKind = isBacklogKind(rawKind) ? rawKind : 'feature';

  return {
    id,
    title: title.trim(),
    kind,
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
  const linksMap: Record<string, unknown> = {
    task: item.links.task,
    spec: item.links.spec,
  };
  if (item.links.parent) linksMap.parent = item.links.parent;
  if (item.links.depends_on && item.links.depends_on.length > 0) linksMap.depends_on = item.links.depends_on;
  if (item.links.blocks && item.links.blocks.length > 0) linksMap.blocks = item.links.blocks;

  const frontmatter = stringifyYaml({
    id: item.id,
    title: item.title,
    ...(item.kind ? { kind: item.kind } : {}),
    status: item.status,
    priority: item.priority,
    level: item.level,
    source: item.source,
    readiness: item.readiness,
    evidence: item.evidence,
    links: linksMap,
    created_at: item.created_at,
  }).trim();
  return `---\n${frontmatter}\n---\n\n${item.body.trim()}\n`;
}

function comparePriority(a: BacklogPriority, b: BacklogPriority): number {
  return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
}

function generateBacklogIndexMd(items: BacklogItem[]): string {
  // R-352：终态 done/dropped 均已归档进 archived/，索引只列非终态
  const activeItems = items.filter((item) => item.status !== 'done' && item.status !== 'dropped');
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
  lines.push('- **done/dropped 条目**: 已归档至 `.docpath/backlog/archived/`，不显示在此索引中（R-352 前该行只写 done）');
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
 * 读取单条（含 archived/）；不存在返回 null（不报错）。
 *
 * R-352：archive 命令与幂等静默收尾需要能看到已归档副本。
 * 默认只读 active（readArchived=false）；archive 流程传 true 使已归档条目可被正视。
 */
export async function readBacklogItem(
  cwd: string,
  id: string,
  opts?: { readArchived?: boolean },
): Promise<BacklogItem | null> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  const file = await findItemFile(dir, id);
  if (!file) {
    if (!opts?.readArchived) return null;
    const archivedDir = archivedBacklogDir(await resolveDocpathDir(cwd));
    const archivedFile = await findItemFile(archivedDir, id);
    if (!archivedFile) return null;
    return parseItem(await readFile(join(archivedDir, archivedFile), 'utf-8'));
  }
  return parseItem(await readFile(join(dir, file), 'utf-8'));
}

/**
 * 写入单条（唯一写入口）。保留既有文件名的 slug；新条目用 `${id}-${slug(title)}.md`。
 *
 * 写路径解耦（R-355/FR-1）：本函数**不再**隐式触发 refreshBacklogIndex。此前每次写
 * （含改优先级、改状态等局部更新）都要付一次「全 active+archived 目录扫描 + 归档 rename
 * + 重建索引」的代价，单条写入成本随 backlog 总量线性增长。
 *
 * 「drop/done 即归档」的 R-352 语义由 setBacklogStatus 在状态转移后显式 rebuild 一次保住；
 * 其余写操作（如 edit 改字段）不再付出索引重建成本，索引由显式 refresh 命令收敛。
 */
export async function writeBacklogItem(cwd: string, item: BacklogItem): Promise<void> {
  const dir = backlogDir(await resolveDocpathDir(cwd));
  await mkdir(dir, { recursive: true });
  item.title = cleanBacklogTitle(item.title, item.id);
  const existing = await findItemFile(dir, item.id);
  const fileName = existing ?? `${item.id}-${slugify(item.title)}.md`;
  await writeFile(join(dir, fileName), serializeItem(item), 'utf-8');
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
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = backlogDir(docpathDir);
  const archivedDir = archivedBacklogDir(docpathDir);
  await mkdir(dir, { recursive: true });

  const cleanedTitle = cleanBacklogTitle(item.title);
  const normalizedItem = { ...item, title: cleanedTitle };

  let next = parseBacklogNumber(await nextBacklogId(cwd));
  while (true) {
    const id = formatBacklogId(next);
    const candidate: BacklogItem = {
      ...normalizedItem,
      id,
      title: cleanBacklogTitle(normalizedItem.title, id),
    };
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
      if (existsSync(archivedDir)) {
        const archivedEntries = await readdir(archivedDir);
        const hasArchivedSibling = archivedEntries.some(
          (f) => (f === `${id}.md` || f.startsWith(`${id}-`)) && f.endsWith('.md'),
        );
        if (hasArchivedSibling) {
          await rm(reservedPath);
          next += 1;
          continue;
        }
      }
      const finalFileName = `${id}-${slugify(candidate.title)}.md`;
      await rename(reservedPath, join(dir, finalFileName));
      // 分配成功 → 推进权威计数器（O(1) 写），下次分配不再全目录扫描
      await writeBacklogIdCounter(docpathDir, next);
      // R-356：登记到跨 worktree 共享注册表，让兄弟 worktree 并行 capture 时可见
      // （fail-open：写失败不阻断创建，兜底仍是实时扫兄弟 worktree）
      await registerBacklogEntry(cwd, { id, title: candidate.title, worktree: cwd });
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
 * 权威 id 计数器文件路径（FR-2）：`<docpath>/backlog/.id-counter`，纯数字文本，原子写（临时文件+rename）。
 * dotfile + 非 `.md` 后缀，天然被 list/scan/archive 的 `/^R-\d+.*\.md$/` 与 `/^R-\d+/` 过滤忽略。
 * 语义：记录「本 checkout 已分配到的最大编号」；首次缺失时以跨 checkout 最大扫描值做权威种子，
 * 此后分配走 O(1) 单文件读写，不再全目录扫描。
 */
function idCounterPath(docpathDir: string): string {
  return join(docpathDir, 'backlog', '.id-counter');
}

/** 读取权威计数器；不存在或不可解析时返回 null（由调用方走种子扫描）。 */
async function readBacklogIdCounter(docpathDir: string): Promise<number | null> {
  const path = idCounterPath(docpathDir);
  if (!existsSync(path)) return null;
  try {
    const raw = (await readFile(path, 'utf-8')).trim();
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

/** 原子写权威计数器（临时文件 + rename，避免并发/崩溃留半写）。 */
async function writeBacklogIdCounter(docpathDir: string, max: number): Promise<void> {
  const path = idCounterPath(docpathDir);
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, String(max), 'utf-8');
  await rename(tmp, path);
}

/**
 * 扫描本 checkout + 主 checkout + **所有兄弟 worktree** 的 active/archived 取全局 max 编号
 * （R-273/FR-3，id 单池种子；R-356 扩展到全 worktree）。
 *
 * R-356：原实现只覆盖「本 + 主 checkout」，兄弟 worktree 不可见 → 并行 capture 各取相同
 * max 产生同号。现经 listWorktreeDocpathDirs 枚举所有 worktree 的 .docpath（含主 checkout），
 * 并叠加共享注册表里已登记的编号，取全局 max。
 */
async function scanBacklogMaxId(cwd: string): Promise<number> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dirs = [backlogDir(docpathDir), archivedBacklogDir(docpathDir)];
  const mainDocpathDir = resolveMainCheckoutDocpathDir(cwd);
  if (mainDocpathDir && resolve(mainDocpathDir) !== resolve(docpathDir)) {
    dirs.push(backlogDir(mainDocpathDir), archivedBacklogDir(mainDocpathDir));
  }
  // R-356：兄弟 worktree 的 backlog 目录（去重；本/主 checkout 已在上面加入，
  // 这里用 resolve 去重避免重复扫描）
  const seenDirs = new Set(dirs.map((dir) => resolve(dir)));
  for (const wtDocpathDir of listWorktreeDocpathDirs(cwd)) {
    for (const dir of [backlogDir(wtDocpathDir), archivedBacklogDir(wtDocpathDir)]) {
      const key = resolve(dir);
      if (seenDirs.has(key)) continue;
      seenDirs.add(key);
      dirs.push(dir);
    }
  }
  let max = 0;
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of await readdir(dir)) {
      if (!file.endsWith('.md') || file === 'backlog.md') continue;
      const match = file.match(/^R-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > max) max = num;
      }
    }
  }
  // R-356：共享注册表里已登记的编号同样计入（兄弟 worktree 可能尚未把文件落到本 checkout，
  // 但已在注册表上留痕——这是并行 capture 防撞号的最后一道保险）
  for (const entry of await readBacklogRegistry(cwd)) {
    const match = entry.id.match(/^R-(\d+)$/i);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    if (num > max) max = num;
  }
  return max;
}

/**
 * 归档撞号留痕（FR-3）：archived 已有同名副本、非破坏性跳过覆盖时，把冲突追加到
 * `<docpath>/backlog/.archive-collisions.log`，作为「报错留痕」证据——既守住 R-321 不覆盖，
 * 又不依赖事后 groom 扫描才能发现。dotfile + 非 `.md`，被各过滤天然忽略。
 */
async function logArchiveCollision(docpathDir: string, id: string, sourceFile: string): Promise<void> {
  const dir = join(docpathDir, 'backlog');
  await mkdir(dir, { recursive: true });
  const line = `${new Date().toISOString()} [archive-collision] entry=${id} source=${sourceFile} (archived 已有同名副本，R-321 非破坏性跳过；id 重分配走独立迁移条目)`;
  await writeFile(join(dir, '.archive-collisions.log'), `${line}\n`, { encoding: 'utf-8', flag: 'a' });
}

/**
 * 分配下一个 R-### id（基于权威计数器，O(1)；首次以跨 checkout max 为种子）。
 *
 * FR-2：把「全目录扫描取 max」收敛为「单文件权威计数器」。首次缺失时经 scanBacklogMaxId
 * 做权威种子（保留 R-273 主 checkout 可见性）；此后 O(1) 读一文件。跨 checkout 同时 capture
 * 的原子性仍靠 createBacklogItem 的 wx 预留（仅锁本 checkout，基线已知边界）。
 */
export async function nextBacklogId(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readBacklogIdCounter(docpathDir);
  const seedMax = await scanBacklogMaxId(cwd);
  const effectiveMax = Math.max(current ?? 0, seedMax);
  if (current !== effectiveMax) {
    await writeBacklogIdCounter(docpathDir, effectiveMax);
  }
  return formatBacklogId(effectiveMax + 1);
}

/**
 * 生成 backlog.md 机器可读索引。
 * 按 priority 升序（P0→P3），同优先级内按 id 升序排序。
 *
 * R-352：终态（done + dropped）统一自动归档进 archived/，索引只列非终态。
 */
export async function refreshBacklogIndex(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = backlogDir(docpathDir);
  const archivedDir = archivedBacklogDir(docpathDir);
  await mkdir(dir, { recursive: true });
  await mkdir(archivedDir, { recursive: true });

  const items = await listBacklogItems(cwd);

  // Archive terminal items before building index (R-352: 补齐 dropped 自动归档，
  // 原先只认 done；复用既有撞号安全阀，非破坏性)
  const terminalItems = items.filter((item) => item.status === 'done' || item.status === 'dropped');
  for (const item of terminalItems) {
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
      } else if (existsSync(sourcePath) && existsSync(targetPath)) {
        // FR-3：撞号安全阀拦截时「留痕」，不依赖事后 groom 才可见
        await logArchiveCollision(docpathDir, item.id, filename);
      }
    }
  }

  // Rebuild active items list after archival（终态 done/dropped 均归档）
  const activeItems = items.filter((item) => item.status !== 'done' && item.status !== 'dropped');
  const sorted = [...activeItems].sort((a, b) => {
    const priorityOrder = comparePriority(a.priority, b.priority);
    if (priorityOrder !== 0) return priorityOrder;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });

  await writeFile(join(dir, 'backlog.md'), generateBacklogIndexMd(sorted), 'utf-8');
}

/**
 * 归档单个终态 backlog 条目（R-352：`docpath backlog archive` 的引擎入口）。
 *
 * - 只接受终态 status（done/dropped），非终态拒绝（需先 drop/done）。
 * - 直接复用同一撞号安全阀：archived 已有同名副本时不覆盖。
 * - 归档后写入 backlog.md 索引，保证 archived/ 与索引一致。
 * - 找不到条目或条目已在 archived 里时：返回 moved=false（幂等，不报错）。
 */
export async function archiveBacklogItem(
  cwd: string,
  id: string,
): Promise<{ moved: boolean; file: string | null }> {
  // R-352：先看 active，active 无名时再正视 archived（幂等静默需要看到已归档副本）
  const item = (await readBacklogItem(cwd, id)) ?? (await readBacklogItem(cwd, id, { readArchived: true }));
  if (!item) {
    throw new Error(`[docpath] backlog 条目不存在: ${id}`);
  }
  if (item.status !== 'done' && item.status !== 'dropped') {
    throw new Error(
      `[docpath] backlog archive 只接受终态条目（done/dropped）：${item.id} 当前 ${item.status}。请先 backlog drop/done`,
    );
  }
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = backlogDir(docpathDir);
  const archivedDir = archivedBacklogDir(docpathDir);
  await mkdir(archivedDir, { recursive: true });
  const filename = await findItemFile(dir, item.id);
  if (!filename) {
    // active 里无该文件名：要么已归档，要么丢数据。显式读 archived 一次后再收敛。
    const archivedFile = await findItemFile(archivedDir, item.id);
    return { moved: false, file: archivedFile };
  }
  const sourcePath = join(dir, filename);
  const targetPath = join(archivedDir, filename);
  // 撞号安全阀（R-321/FR-2）：archived 已有同名副本时拒绝覆盖，由 groom 非破坏性暴露
  if (existsSync(sourcePath) && !existsSync(targetPath)) {
    await rename(sourcePath, targetPath);
    await refreshBacklogIndex(cwd);
    return { moved: true, file: `backlog/archived/${filename}` };
  }
  // FR-3：撞号安全阀拦截（archived 已有同名副本）时留痕，再回落幂等静默
  await logArchiveCollision(docpathDir, item.id, filename);
  await refreshBacklogIndex(cwd);
  return { moved: false, file: `backlog/${filename}` };
}

/**
 * 检测重复登记（R-352：promote 阶段去重提示的引擎入口）。
 *
 * 只报告、不改数据：
 * - 同 id 报告：active 与 archived 同 id 并存（撞号，沿用 detectBacklogIdCollisions）。
 * - 同标题报告：active 区另有同 title 条目，或 archived 区已有同 title 副本
 *   （normalize 后比较：NFC + 去首尾空白 + 压缩连续空白 + 英文小写）。
 */
export interface BacklogDuplicateReport {
  id: string;
  kind: 'same-id' | 'same-title' | 'similar-title';
  active_file: string;
  archived_file: string | null;
  active_title: string;
  archived_title: string | null;
  identical: boolean;
  similarity?: number;
}

export function calculateTitleSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const normB = b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < normA.length - 1; i++) {
    bigramsA.add(normA.slice(i, i + 2));
  }
  const bigramsB = new Set<string>();
  for (let i = 0; i < normB.length - 1; i++) {
    bigramsB.add(normB.slice(i, i + 2));
  }
  if (bigramsA.size === 0 || bigramsB.size === 0) {
    return normA.includes(normB) || normB.includes(normA) ? 0.8 : 0;
  }
  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

function normalizeBacklogTitle(title: string): string {
  return cleanBacklogTitle(title)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export async function detectBacklogDuplicates(
  cwd: string,
  item: Pick<BacklogItem, 'id' | 'title'>,
): Promise<BacklogDuplicateReport[]> {
  const reports: BacklogDuplicateReport[] = [];
  // 同 id：沿既有撞号检测的结果集（本地 active+archived）；FR-6 追加主 checkout 扫描
  const collisions = await detectBacklogIdCollisions(cwd);
  for (const c of collisions) {
    if (c.id !== item.id) continue;
    reports.push({
      id: c.id,
      kind: 'same-id',
      active_file: c.active_file,
      archived_file: c.archived_file,
      active_title: c.active_title,
      archived_title: c.archived_title,
      identical: c.identical,
    });
  }
  // 同标题 / 相似标题：本地 + 主 checkout（worktree 快照可能 stale）的 active/archived
  const needle = normalizeBacklogTitle(item.title);
  if (!needle) return reports;

  const docpathDir = await resolveDocpathDir(cwd);
  // roots：label → 可读前缀；active 区的存档语义（isActive）区分 active/archived 展示
  const roots: Array<{ label: string; dir: string; isActive: boolean }> = [
    { label: 'backlog', dir: join(docpathDir, 'backlog'), isActive: true },
    { label: 'backlog/archived', dir: join(docpathDir, 'backlog', 'archived'), isActive: false },
  ];
  const mainDocpathDir = resolveMainCheckoutDocpathDir(cwd);
  if (mainDocpathDir && resolve(mainDocpathDir) !== resolve(docpathDir)) {
    roots.push(
      { label: 'main.backlog', dir: join(mainDocpathDir, 'backlog'), isActive: true },
      { label: 'main.backlog/archived', dir: join(mainDocpathDir, 'backlog', 'archived'), isActive: false },
    );
  }
  // R-356：兄弟 worktree 的 active/archived 也纳入（原先只扫本 + 主 checkout，
  // 并行 worktree 里已存在的同标题条目不可见 → 结构性重复登记）
  const seenRootDirs = new Set(roots.map((root) => resolve(root.dir)));
  for (const wtDocpathDir of listWorktreeDocpathDirs(cwd)) {
    const wtActive = join(wtDocpathDir, 'backlog');
    const wtArchived = join(wtDocpathDir, 'backlog', 'archived');
    if (resolve(wtActive) === resolve(docpathDir)) continue; // 本 checkout 已加
    for (const [dir, isActive] of [[wtActive, true], [wtArchived, false]] as const) {
      const key = resolve(dir);
      if (seenRootDirs.has(key)) continue;
      seenRootDirs.add(key);
      roots.push({ label: `worktree:${dir}`, dir, isActive });
    }
  }

  const selfLocalFile = (await findItemFile(join(docpathDir, 'backlog'), item.id)) ?? '';
  const seen = new Set<string>();
  const peers: Array<{ label: string; file: string; title: string; isActive: boolean; kind: 'same-title' | 'similar-title'; similarity?: number }> = [];
  for (const root of roots) {
    if (!existsSync(root.dir)) continue;
    for (const file of await readdir(root.dir)) {
      if (!/^R-\d+.*\.md$/i.test(file) || file === 'backlog.md') continue;
      const content = await readFileOrSkip(join(root.dir, file));
      if (content === null) continue;
      const title = frontmatterTitle(content);
      // 本地 active 区跳过「本条」自身（R-040/R-040-slug），避免自报重复
      const isSelf = root.label === 'backlog' && (file.startsWith(`${item.id}-`) || file === `${item.id}.md`);
      if (isSelf) continue;

      const normTitle = normalizeBacklogTitle(title);
      const isExact = normTitle === needle;
      const sim = isExact ? 1.0 : calculateTitleSimilarity(normTitle, needle);

      if (!isExact && sim < 0.75) continue;

      const key = `${root.label}:${file}`;
      if (seen.has(key)) continue;
      seen.add(key);
      peers.push({
        label: root.label,
        file,
        title,
        isActive: root.isActive,
        kind: isExact ? 'same-title' : 'similar-title',
        similarity: isExact ? undefined : sim,
      });
    }
  }

  for (const peer of peers) {
    // R-356：label 可能是 worktree:<dir>（兄弟 worktree 的 active/archived），
    // 归档与否改看 isActive 语义，不再依赖 label 字符串形状。
    const isLocalActive = peer.label === 'backlog';
    reports.push({
      id: item.id,
      kind: peer.kind,
      active_file: peer.isActive
        ? (isLocalActive ? `backlog/${peer.file}` : `${peer.label}/${peer.file}`)
        : (selfLocalFile || item.id),
      archived_file: peer.isActive ? null : `${peer.label}/${peer.file}`,
      active_title: peer.isActive && !isLocalActive ? peer.title : item.title,
      archived_title: peer.isActive ? null : peer.title,
      identical: !peer.isActive && peer.label === 'backlog/archived' && peer.kind === 'same-title',
      similarity: peer.similarity,
    });
  }

  // FR-6：主 checkout 与「本条」同 id 的撞号（本地 detectBacklogIdCollisions 不跨 checkout）
  const mainActive = roots.find((r) => r.label === 'main.backlog');
  if (mainActive && existsSync(mainActive.dir)) {
    const mainFile = await findItemFile(mainActive.dir, item.id);
    if (mainFile) {
      const content = await readFileOrSkip(join(mainActive.dir, mainFile));
      if (content !== null) {
        reports.push({
          id: item.id,
          kind: 'same-id',
          active_file: `main.backlog/${mainFile}`,
          archived_file: null,
          active_title: frontmatterTitle(content),
          archived_title: null,
          identical: false,
        });
      }
    }
  }

  // R-356：兄弟 worktree 与「本条」同 id 的撞号（文件可能尚未落到本 checkout）
  const seenPeerIds = new Set(reports.filter((r) => r.kind === 'same-id').map((r) => r.active_file));
  for (const wtDocpathDir of listWorktreeDocpathDirs(cwd)) {
    if (resolve(wtDocpathDir) === resolve(docpathDir)) continue;
    const wtActive = join(wtDocpathDir, 'backlog');
    if (!existsSync(wtActive)) continue;
    const wtFile = await findItemFile(wtActive, item.id);
    if (!wtFile) continue;
    const label = `worktree:${wtActive}/${wtFile}`;
    if (seenPeerIds.has(label)) continue;
    const content = await readFileOrSkip(join(wtActive, wtFile));
    if (content === null) continue;
    reports.push({
      id: item.id,
      kind: 'same-id',
      active_file: label,
      archived_file: null,
      active_title: frontmatterTitle(content),
      archived_title: null,
      identical: false,
    });
  }

  // R-356：共享注册表探测——兄弟 worktree 已登记但文件尚未可见时仍能提示。
  for (const holder of await findRegistryIdHolders(cwd, item.id)) {
    if (resolve(holder.worktree) === resolve(cwd)) continue;
    const label = `registry:${holder.worktree}`;
    if (seenPeerIds.has(label)) continue;
    reports.push({
      id: item.id,
      kind: 'same-id',
      active_file: label,
      archived_file: null,
      active_title: holder.title,
      archived_title: null,
      identical: false,
    });
  }
  for (const holder of await findRegistryTitleHolders(cwd, item.title)) {
    if (holder.id === item.id) continue;
    if (resolve(holder.worktree) === resolve(cwd)) continue;
    reports.push({
      id: holder.id,
      kind: 'same-title',
      active_file: `registry:${holder.worktree}`,
      archived_file: null,
      active_title: holder.title,
      archived_title: null,
      identical: false,
    });
  }
  return reports;
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

/** 任务 id 形态：防路径穿越（--task 值来自用户输入） */
const TASK_ID_PATTERN = /^T-[A-Za-z0-9_-]+$/;

/** R-346: 任务证据存在性——旁路闭环必须能在 tasks/ 或 tasks/done/ 下找到真实执行痕迹。 */
async function hasTaskEvidence(cwd: string, taskId: string): Promise<boolean> {
  if (!TASK_ID_PATTERN.test(taskId)) return false;
  const dir = await resolveDocpathDir(cwd);
  const roots = [join(dir, 'tasks', taskId), join(dir, 'tasks', 'done', taskId)];
  return roots.some((root) =>
    existsSync(join(root, 'breadcrumb.jsonl'))
    || existsSync(join(root, 'spec.json'))
    || existsSync(join(root, 'plan.json')),
  );
}

export interface SetBacklogStatusOptions {
  /**
   * R-346 旁路闭环：为 quick（或其它绕过 promote 的路径）关联已执行任务作为
   * done 的证据。值必须对应真实存在的任务目录；条目已有链接且不同值时 fail-loud。
   */
  linkTask?: string;
}

/**
 * 读取 → 转移 → 写回（组合 FSM 与 I/O 的单一入口）。
 * 条目不存在或非法转移时 fail-loud 抛错。返回更新后的条目。
 *
 * done 转移一律要求任务证据（R-346）：promote 链由 links.task 自动满足；
 * quick 等旁路闭环经 opts.linkTask 补录并校验任务目录真实存在。
 */
export async function setBacklogStatus(
  cwd: string,
  id: string,
  to: BacklogStatus,
  opts?: SetBacklogStatusOptions,
): Promise<BacklogItem> {
  const item = await readBacklogItem(cwd, id);
  if (!item) {
    throw new Error(`[docpath] backlog 条目不存在: ${id}`);
  }
  if (opts?.linkTask) {
    const linkTask = opts.linkTask.trim();
    if (item.links.task && item.links.task !== linkTask) {
      throw new Error(`[docpath] backlog --task 冲突：${id} 已链接任务 ${item.links.task}，拒绝覆盖为 ${linkTask}`);
    }
    if (!(await hasTaskEvidence(cwd, linkTask))) {
      throw new Error(`[docpath] backlog --task: 任务证据不存在: ${linkTask}（tasks/${linkTask}/ 或 tasks/done/${linkTask}/ 应含 breadcrumb/spec/plan 之一）`);
    }
    item.links.task = linkTask;
  }
  if (to === 'done') {
    if (!item.links.task) {
      throw new Error('[docpath] backlog done 需要任务证据：条目未链接任务。quick/旁路闭环请加 --task <任务 id>，或经 promote 链执行');
    }
    if (!(await hasTaskEvidence(cwd, item.links.task))) {
      throw new Error(`[docpath] backlog done: 任务证据缺失：${item.links.task} 在 tasks/ 或 tasks/done/ 下无执行痕迹（疑似手工链接或目录被清理）`);
    }
  }
  item.status = transitionBacklog(item.status, to);
  await writeBacklogItem(cwd, item);
  // R-352 语义：状态转移是「归档边界」——done/dropped 必须立即归档。writeBacklogItem
  // 已不再隐式重建索引（FR-1 写路径解耦），故在转移后显式重建一次，保住「drop/done 即归档」。
  await refreshBacklogIndex(cwd);
  return item;
}
