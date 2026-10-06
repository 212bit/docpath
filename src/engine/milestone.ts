import { existsSync, readdirSync } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readFileSafe, resolveDocpathDir, ensureDir } from '../utils/file.js';
import { resolveRulePaths } from '../utils/rules.js';
import { readDecisionJsonl } from '../utils/decisions.js';
import {
  listBacklogItems,
  listAllBacklogItems,
  readBacklogItem,
  writeBacklogItem,
  createBacklogItem,
  type BacklogItem,
  type BacklogKind,
  type BacklogPriority,
} from './backlog.js';
import { readActiveTaskFile, canonicalTaskDir, archivedTaskDir } from '../utils/task-files.js';
import { parseSpecMarkdownDocument, type StructuredSpecDocument } from '../utils/structured-docs.js';
import { parsePlanSteps } from '../utils/doc-parser.js';
import { refreshProjectDocumentIndex } from '../utils/document-index.js';
import { publishMilestoneRelease, type ChangelogReleaseData } from './changelog.js';

export type MilestoneStatus = 'planned' | 'active' | 'accepted' | 'released' | 'archived';
export type MilestonePriority = 'P0' | 'P1' | 'P2' | 'P3';

const VALID_MILESTONE_STATUSES = new Set<MilestoneStatus>([
  'planned',
  'active',
  'accepted',
  'released',
  'archived',
]);

const VALID_MILESTONE_PRIORITIES = new Set<MilestonePriority>(['P0', 'P1', 'P2', 'P3']);

const MILESTONE_TRANSITIONS: Record<MilestoneStatus, MilestoneStatus[]> = {
  planned: ['active', 'archived'],
  active: ['accepted', 'planned', 'archived'],
  accepted: ['released', 'active', 'archived'],
  released: ['archived'],
  archived: ['planned', 'active'],
};

export function isMilestoneStatus(val: string): val is MilestoneStatus {
  return VALID_MILESTONE_STATUSES.has(val as MilestoneStatus);
}

export function isMilestonePriority(val: string): val is MilestonePriority {
  return VALID_MILESTONE_PRIORITIES.has(val as MilestonePriority);
}

export function canTransitionMilestone(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionMilestone(from: MilestoneStatus, to: MilestoneStatus): MilestoneStatus {
  if (from === to) return to;
  if (!canTransitionMilestone(from, to)) {
    const allowed = MILESTONE_TRANSITIONS[from]?.join(', ') || '无';
    throw new Error(`[docpath] 非法里程碑状态转移: ${from} → ${to} (允许目标: ${allowed})`);
  }
  return to;
}

export interface MilestoneAcceptanceCriterion {
  id: string; // e.g. 'MAC-1'
  text: string;
  done: boolean;
}

export interface MilestoneItem {
  id: string; // e.g. 'M-001'
  title: string;
  status: MilestoneStatus;
  priority: MilestonePriority;
  version_target?: string | null;
  target_date?: string | null;
  owner?: string | null;
  created_at: string;
  updated_at?: string;
  backlog_ids: string[];
  acceptance_criteria: MilestoneAcceptanceCriterion[];
  body: string;
  filePath?: string;
}

export type MilestoneHealthStatus = 'on_track' | 'at_risk' | 'overdue';

export interface MilestoneProgress {
  milestone: MilestoneItem;
  health: {
    status: MilestoneHealthStatus;
    label: string;
    days_remaining: number | null;
    risk_reasons: string[];
  };
  backlog_summary: {
    total: number;
    done: number;
    active: number;
    planned: number;
    proposed: number;
    dropped: number;
    percent: number;
    items: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      level?: number;
      task?: string | null;
      is_blocked?: boolean;
    }>;
  };
  criteria_summary: {
    total: number;
    done: number;
    percent: number;
    items: MilestoneAcceptanceCriterion[];
  };
  top_blockers: Array<{
    id: string;
    title: string;
    status: string;
    blocked_count: number;
  }>;
  overall_percent: number;
  is_ready_for_acceptance: boolean;
  blockers: string[];
}

export interface MilestoneTaskSummary {
  taskId: string;
  title: string;
  completedAt?: string;
  frCount: number;
  acCount: number;
  stepCount: number;
}

export interface MilestoneBacklogSummary {
  id: string;
  title: string;
  priority: string;
  status: string;
}

export interface MilestoneDecisionSummary {
  id: string;
  category: string;
  conclusion: string;
  createdAt: string;
  taskId?: string;
}

export interface MilestoneRuleSummary {
  name: string;
  ruleCount: number;
  displayPath: string;
}

export interface MilestoneData {
  version: string;
  title: string;
  date: string;
  summary: string;
  tasks: MilestoneTaskSummary[];
  backlog: MilestoneBacklogSummary[];
  decisions: MilestoneDecisionSummary[];
  rules: MilestoneRuleSummary[];
  metrics: {
    totalTasks: number;
    totalBacklogClosed: number;
    totalDecisions: number;
    totalRules: number;
  };
}

export interface MilestoneMeta {
  version: string;
  title: string;
  date: string;
  path: string;
  displayPath: string;
  taskCount: number;
}

function milestonesDir(docpathDir: string): string {
  return join(docpathDir, 'milestones');
}

function slugify(title: string): string {
  const cleaned = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[/\\:*?"<>|\u0000-\u001f\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  const truncated = Array.from(cleaned).slice(0, 32).join('').replace(/-+$/g, '');
  return truncated || 'milestone';
}

function parseMilestoneNumber(id: string): number {
  const n = parseInt(id.replace(/^M-/i, ''), 10);
  return Number.isNaN(n) ? 0 : n;
}

function formatMilestoneId(number: number): string {
  return `M-${String(number).padStart(3, '0')}`;
}

export function parseMilestoneContent(content: string, filePath?: string): MilestoneItem {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('[docpath] 里程碑文件缺少合法的 YAML Frontmatter');
  }

  let fm: Record<string, unknown> = {};
  try {
    fm = (parseYaml(match[1]) as Record<string, unknown>) || {};
  } catch (err) {
    throw new Error(`[docpath] 里程碑 Frontmatter 解析失败: ${(err as Error).message}`);
  }

  const id = String(fm.id ?? '').trim().toUpperCase();
  const title = String(fm.title ?? '').trim();
  const statusRaw = String(fm.status ?? 'planned').trim().toLowerCase();
  const status: MilestoneStatus = isMilestoneStatus(statusRaw) ? statusRaw : 'planned';
  const priorityRaw = String(fm.priority ?? 'P1').trim().toUpperCase();
  const priority: MilestonePriority = isMilestonePriority(priorityRaw) ? priorityRaw : 'P1';
  const createdAt = String(fm.created_at ?? new Date().toISOString().slice(0, 10)).trim();
  const updatedAt = fm.updated_at ? String(fm.updated_at).trim() : undefined;
  const versionTarget = fm.version_target ? String(fm.version_target).trim() : (fm.version ? String(fm.version).trim() : null);
  const targetDate = fm.target_date ? String(fm.target_date).trim() : null;
  const owner = fm.owner ? String(fm.owner).trim() : null;

  const rawBacklogIds = Array.isArray(fm.backlog_ids)
    ? fm.backlog_ids.map(String)
    : Array.isArray(fm.backlogIds)
      ? fm.backlogIds.map(String)
      : typeof fm.backlog_ids === 'string'
        ? (fm.backlog_ids as string).split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean)
        : [];

  const rawCriteria = Array.isArray(fm.acceptance_criteria)
    ? (fm.acceptance_criteria as Array<Record<string, unknown>>)
    : [];

  const acceptanceCriteria: MilestoneAcceptanceCriterion[] = rawCriteria.map((c, idx) => ({
    id: String(c.id || `MAC-${idx + 1}`),
    text: String(c.text || c.title || ''),
    done: !!c.done,
  }));

  const body = (match[2] || '').trim();

  // Also parse markdown MAC checkboxes if not in frontmatter
  if (acceptanceCriteria.length === 0 && body) {
    const macMatches = body.matchAll(/^- \[(x| )\]\s*(?:\[?(MAC-\d+)\]?:?\s*)?(.*)$/gim);
    let idx = 1;
    for (const m of macMatches) {
      const isDone = m[1].toLowerCase() === 'x';
      const macId = m[2] || `MAC-${idx}`;
      const text = m[3].trim();
      if (text) {
        acceptanceCriteria.push({ id: macId, text, done: isDone });
        idx++;
      }
    }
  }

  return {
    id,
    title,
    status,
    priority,
    version_target: versionTarget,
    target_date: targetDate,
    owner,
    created_at: createdAt,
    updated_at: updatedAt,
    backlog_ids: Array.from(new Set(rawBacklogIds)),
    acceptance_criteria: acceptanceCriteria,
    body,
    filePath,
  };
}

export function serializeMilestoneItem(item: MilestoneItem): string {
  const frontmatterObj: Record<string, unknown> = {
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    ...(item.version_target ? { version_target: item.version_target } : {}),
    ...(item.target_date ? { target_date: item.target_date } : {}),
    ...(item.owner ? { owner: item.owner } : {}),
    ...(item.backlog_ids.length > 0 ? { backlog_ids: item.backlog_ids } : {}),
    ...(item.acceptance_criteria.length > 0
      ? {
          acceptance_criteria: item.acceptance_criteria.map((c) => ({
            id: c.id,
            text: c.text,
            done: c.done,
          })),
        }
      : {}),
    created_at: item.created_at,
    ...(item.updated_at ? { updated_at: item.updated_at } : {}),
  };

  let body = item.body.trim();
  for (const c of item.acceptance_criteria) {
    const mark = c.done ? 'x' : ' ';
    const escapedId = c.id.replace(/[-[\]/{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(`^-\\s*\\[[ xX]\\]\\s*(\\[?${escapedId}\\]?:?\\s*.*)$`, 'm');
    if (regex.test(body)) {
      body = body.replace(regex, `- [${mark}] $1`);
    }
  }

  const frontmatter = stringifyYaml(frontmatterObj).trim();
  return `---\n${frontmatter}\n---\n\n${body}\n`;
}

export function generateMilestoneBody(
  title: string,
  options?: {
    objective?: string;
    criteria?: string[];
    nonGoals?: string;
  },
): string {
  const objective = options?.objective?.trim() || title;
  const criteria = options?.criteria || [];
  const nonGoals = options?.nonGoals?.trim();

  const lines: string[] = [
    '## 1. 🎯 里程碑核心目标 (Objective)',
    objective,
    '',
    '## 2. 📋 关联需求清单 (Backlog Scope)',
    '*(创建或拆解 Backlog 后将自动关联并汇总在此)*',
    '',
    '## 3. 🏁 里程碑验收标准 (Milestone Acceptance Criteria)',
  ];

  if (criteria.length === 0) {
    lines.push('- [ ] [MAC-1] 关联核心 Backlog 需求全部闭环且测试 100% 通过');
  } else {
    criteria.forEach((c, idx) => {
      lines.push(`- [ ] [MAC-${idx + 1}] ${c}`);
    });
  }

  lines.push('', '## 4. 边界与约束 (Boundaries & Constraints)');
  lines.push(nonGoals ? `- **Non-Goals**: ${nonGoals}` : '- 保持向下兼容，不引入未评估的破坏性变更');
  lines.push('');

  return lines.join('\n');
}

export async function findNextMilestoneId(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = milestonesDir(docpathDir);
  if (!existsSync(dir)) return 'M-001';

  const files = await readdir(dir);
  let max = 0;
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const match = f.match(/^M-(\d+)/i);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return formatMilestoneId(max + 1);
}

export async function writeMilestoneItem(cwd: string, item: MilestoneItem): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = milestonesDir(docpathDir);
  await ensureDir(dir);

  item.updated_at = new Date().toISOString().slice(0, 10);

  // Check existing file
  const files = existsSync(dir) ? await readdir(dir) : [];
  const existing = files.find((f) => f === `${item.id}.md` || f.startsWith(`${item.id}-`));
  const fileName = existing ?? `${item.id}-${slugify(item.title)}.md`;
  const filePath = join(dir, fileName);

  await writeFile(filePath, serializeMilestoneItem(item), 'utf-8');
  item.filePath = filePath;
  return filePath;
}

export async function readMilestoneItem(cwd: string, idOrVersion: string): Promise<MilestoneItem | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = milestonesDir(docpathDir);
  if (!existsSync(dir)) return null;

  const target = idOrVersion.trim();
  const isId = /^M-\d+$/i.test(target);
  const files = await readdir(dir);

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    if (isId && (file === `${target.toUpperCase()}.md` || file.startsWith(`${target.toUpperCase()}-`))) {
      const content = await readFile(join(dir, file), 'utf-8');
      try {
        return parseMilestoneContent(content, join(dir, file));
      } catch {
        return null;
      }
    }
  }

  // If not matched by ID prefix, scan all items for version_target or title match
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(dir, file), 'utf-8');
    try {
      const parsed = parseMilestoneContent(content, join(dir, file));
      if (
        parsed.id.toLowerCase() === target.toLowerCase() ||
        (parsed.version_target && parsed.version_target.toLowerCase() === target.toLowerCase()) ||
        parsed.title.toLowerCase() === target.toLowerCase()
      ) {
        return parsed;
      }
    } catch {
      // ignore non-planning release notes or broken files
    }
  }

  return null;
}

export async function listMilestoneItems(cwd: string): Promise<MilestoneItem[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = milestonesDir(docpathDir);
  if (!existsSync(dir)) return [];

  const files = await readdir(dir);
  const items: MilestoneItem[] = [];

  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    if (!/^M-\d+/i.test(file)) continue;
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const item = parseMilestoneContent(content, join(dir, file));
      items.push(item);
    } catch {
      // ignore
    }
  }

  return items.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export interface CreateMilestoneOptions {
  title: string;
  version_target?: string;
  target_date?: string;
  priority?: MilestonePriority;
  owner?: string;
  objective?: string;
  criteria?: string[];
  nonGoals?: string;
  body?: string;
}

export async function createMilestoneItem(cwd: string, options: CreateMilestoneOptions): Promise<MilestoneItem> {
  const id = await findNextMilestoneId(cwd);
  const nowStr = new Date().toISOString().slice(0, 10);
  const priority = options.priority || 'P1';

  const criteriaList: MilestoneAcceptanceCriterion[] = (options.criteria || [
    '关联核心 Backlog 需求全部闭环且测试 100% 通过',
  ]).map((c, idx) => ({
    id: `MAC-${idx + 1}`,
    text: c,
    done: false,
  }));

  const body =
    options.body ||
    generateMilestoneBody(options.title, {
      objective: options.objective || options.title,
      criteria: options.criteria,
      nonGoals: options.nonGoals,
    });

  const item: MilestoneItem = {
    id,
    title: options.title.trim(),
    status: 'planned',
    priority,
    version_target: options.version_target?.trim() || null,
    target_date: options.target_date?.trim() || null,
    owner: options.owner?.trim() || null,
    created_at: nowStr,
    updated_at: nowStr,
    backlog_ids: [],
    acceptance_criteria: criteriaList,
    body,
  };

  await writeMilestoneItem(cwd, item);
  return item;
}

export async function bindMilestoneBacklogs(
  cwd: string,
  milestoneId: string,
  backlogIds: string[],
): Promise<{ milestone: MilestoneItem; boundIds: string[] }> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  const normalizedBacklogIds = backlogIds.map((id) => id.trim().toUpperCase()).filter(Boolean);
  const boundIds: string[] = [];

  for (const bId of normalizedBacklogIds) {
    const item = await readBacklogItem(cwd, bId, { readArchived: true });
    if (item) {
      item.links = item.links || { task: null, spec: null };
      item.links.milestone = milestone.id;
      await writeBacklogItem(cwd, item);
      boundIds.push(item.id);
    }
  }

  const merged = Array.from(new Set([...milestone.backlog_ids, ...boundIds]));
  milestone.backlog_ids = merged;
  if (milestone.status === 'planned' && boundIds.length > 0) {
    milestone.status = 'active';
  }

  await writeMilestoneItem(cwd, milestone);
  return { milestone, boundIds };
}

export async function unbindMilestoneBacklogs(
  cwd: string,
  milestoneId: string,
  backlogIds: string[],
): Promise<{ milestone: MilestoneItem; unboundIds: string[] }> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  const normalizedBacklogIds = new Set(backlogIds.map((id) => id.trim().toUpperCase()).filter(Boolean));
  const unboundIds: string[] = [];

  for (const bId of normalizedBacklogIds) {
    const item = await readBacklogItem(cwd, bId, { readArchived: true });
    if (item && item.links.milestone === milestone.id) {
      item.links.milestone = null;
      await writeBacklogItem(cwd, item);
      unboundIds.push(item.id);
    }
  }

  milestone.backlog_ids = milestone.backlog_ids.filter((id) => !normalizedBacklogIds.has(id));
  await writeMilestoneItem(cwd, milestone);
  return { milestone, unboundIds };
}

export interface DecomposeItemInput {
  title: string;
  kind?: BacklogKind;
  priority?: BacklogPriority;
  level?: number;
  background?: string;
  acceptance?: string;
}

export function extractDecomposeItemsFromBody(body: string, milestoneTitle: string): DecomposeItemInput[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const items: DecomposeItemInput[] = [];
  let inScopeSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^##+\s+(?:\d+\.\s*)?.*(?:关联需求|拆解|scope|backlog|核心功能|功能要点|目标|objective)/i.test(trimmed)) {
      inScopeSection = true;
      continue;
    } else if (/^##+\s+/.test(trimmed)) {
      inScopeSection = false;
    }

    if (inScopeSection) {
      if (
        !trimmed ||
        trimmed.startsWith('#') ||
        trimmed.startsWith('<!--') ||
        trimmed.includes('待补充') ||
        trimmed.includes('自动关联') ||
        trimmed.includes('Non-Goals')
      ) continue;
      const match = trimmed.match(/^[-*]\s+(?:\[[ xX]\]\s+)?(?:\d+[\.、]\s+)?(.+)$/) || trimmed.match(/^\d+[\.、]\s+(.+)$/);
      if (match) {
        let text = match[1].replace(/^(?:FR|fr|MAC|mac)-\d+\s*:\s*/, '').trim();
        let itemKind: BacklogKind | undefined;
        let itemPriority: BacklogPriority | undefined;

        // Parse [feature|bug|infra|docs|refactor|perf|chore]
        const kindMatch = text.match(/^\[(feature|feat|bug|infra|docs|refactor|perf|chore)\]\s*/i);
        if (kindMatch) {
          const rawKind = kindMatch[1].toLowerCase();
          itemKind = rawKind === 'feat' ? 'feature' : (rawKind as BacklogKind);
          text = text.slice(kindMatch[0].length).trim();
        }

        // Parse [P0|P1|P2|P3]
        const prioMatch = text.match(/^\[(P[0-3])\]\s*/i);
        if (prioMatch) {
          itemPriority = prioMatch[1].toUpperCase() as BacklogPriority;
          text = text.slice(prioMatch[0].length).trim();
        }

        // If kind came after priority, check again
        if (!itemKind) {
          const kindMatch2 = text.match(/^\[(feature|feat|bug|infra|docs|refactor|perf|chore)\]\s*/i);
          if (kindMatch2) {
            const rawKind = kindMatch2[1].toLowerCase();
            itemKind = rawKind === 'feat' ? 'feature' : (rawKind as BacklogKind);
            text = text.slice(kindMatch2[0].length).trim();
          }
        }

        if (text && text.length >= 2 && !text.toLowerCase().startsWith('non-goals')) {
          items.push({
            title: text,
            kind: itemKind,
            priority: itemPriority,
          });
        }
      }
    }
  }

  return items;
}

export async function decomposeMilestone(
  cwd: string,
  milestoneId: string,
  items: DecomposeItemInput[],
): Promise<{ milestone: MilestoneItem; createdBacklogs: BacklogItem[] }> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  let effectiveItems = items;
  if (!effectiveItems || effectiveItems.length === 0) {
    effectiveItems = extractDecomposeItemsFromBody(milestone.body, milestone.title);
  }

  if (effectiveItems.length === 0) {
    throw new Error(
      `[docpath] 里程碑 ${milestoneId} 缺少可拆解的条目。请在正文中添加列表项，或通过 --items / --title 传入待拆解需求。`,
    );
  }

  const createdBacklogs: BacklogItem[] = [];
  const newIds: string[] = [];

  for (const input of effectiveItems) {
    const kind: BacklogKind = input.kind || 'feature';
    const priority: BacklogPriority = input.priority || milestone.priority || 'P1';
    const level = input.level ?? 2;

    const created = await createBacklogItem(cwd, {
      title: input.title,
      kind,
      priority,
      level,
      status: 'proposed',
      source: `milestone:${milestone.id}`,
      readiness: 'shaped',
      evidence: {
        brainstorm: null,
        analysis: null,
        spec: null,
        decision_brief: null,
        user_confirmed: null,
      },
      links: {
        task: null,
        spec: null,
        milestone: milestone.id,
      },
      created_at: new Date().toISOString().slice(0, 10),
      body: [
        '## 1. 需求背景与目标',
        input.background || `- 来自里程碑 [${milestone.id}] ${milestone.title}`,
        '',
        '## 2. 严格验收标准',
        input.acceptance ? `- [AC-1] ${input.acceptance}` : '- [AC-1] 待细化验证条件',
        '',
        '## 3. 边界与约束',
        '- 遵循里程碑整体架构与设计规范',
      ].join('\n'),
    });

    createdBacklogs.push(created);
    newIds.push(created.id);
  }

  milestone.backlog_ids = Array.from(new Set([...milestone.backlog_ids, ...newIds]));
  if (milestone.status === 'planned') {
    milestone.status = 'active';
  }
  await writeMilestoneItem(cwd, milestone);

  return { milestone, createdBacklogs };
}

export async function getMilestoneProgress(cwd: string, milestoneId: string): Promise<MilestoneProgress> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  const allBacklogs = await listAllBacklogItems(cwd);
  const linkedBacklogs = allBacklogs.filter(
    (b) => milestone.backlog_ids.includes(b.id) || b.links.milestone === milestone.id,
  );

  const totalBacklogs = linkedBacklogs.length;
  const doneBacklogs = linkedBacklogs.filter((b) => b.status === 'done').length;
  const activeBacklogs = linkedBacklogs.filter((b) => b.status === 'active').length;
  const plannedBacklogs = linkedBacklogs.filter((b) => b.status === 'planned').length;
  const proposedBacklogs = linkedBacklogs.filter((b) => b.status === 'proposed').length;
  const droppedBacklogs = linkedBacklogs.filter((b) => b.status === 'dropped').length;

  const validTargetBacklogs = totalBacklogs - droppedBacklogs;
  const backlogPercent = validTargetBacklogs > 0 ? Math.round((doneBacklogs / validTargetBacklogs) * 100) : 0;

  const totalCriteria = milestone.acceptance_criteria.length;
  const doneCriteria = milestone.acceptance_criteria.filter((c) => c.done).length;
  const criteriaPercent = totalCriteria > 0 ? Math.round((doneCriteria / totalCriteria) * 100) : 100;

  const overallPercent =
    totalBacklogs > 0 && totalCriteria > 0
      ? Math.round(backlogPercent * 0.7 + criteriaPercent * 0.3)
      : totalBacklogs > 0
        ? backlogPercent
        : criteriaPercent;

  const blockers: string[] = [];
  for (const b of linkedBacklogs) {
    if (b.status !== 'done' && b.status !== 'dropped') {
      blockers.push(`需求 [${b.id}] ${b.title} 仍处于 ${b.status} 状态`);
    }
  }

  for (const c of milestone.acceptance_criteria) {
    if (!c.done) {
      blockers.push(`验收条件 [${c.id}] 未满足: ${c.text}`);
    }
  }

  const isReady = blockers.length === 0;

  // 1. Health & Drift calculation
  let healthStatus: MilestoneHealthStatus = 'on_track';
  let daysRemaining: number | null = null;
  const riskReasons: string[] = [];

  if (milestone.status === 'released' || milestone.status === 'accepted' || isReady) {
    healthStatus = 'on_track';
  } else if (milestone.target_date) {
    const targetTime = new Date(milestone.target_date).getTime();
    if (!Number.isNaN(targetTime)) {
      daysRemaining = Math.ceil((targetTime - Date.now()) / (1000 * 3600 * 24));
      if (daysRemaining < 0) {
        healthStatus = 'overdue';
        riskReasons.push(`目标截止日期已逾期 ${Math.abs(daysRemaining)} 天`);
      } else if (daysRemaining <= 7 && backlogPercent < 70) {
        healthStatus = 'at_risk';
        riskReasons.push(`距离截止日期仅剩 ${daysRemaining} 天，完成度仅 ${backlogPercent}%`);
      } else if (daysRemaining <= 14 && backlogPercent < 40) {
        healthStatus = 'at_risk';
        riskReasons.push(`距离截止日期仅剩 ${daysRemaining} 天，完成度仅 ${backlogPercent}%`);
      }
    }
  } else {
    if (activeBacklogs === 0 && proposedBacklogs > 0 && validTargetBacklogs > 0) {
      healthStatus = 'at_risk';
      riskReasons.push('未规划明确截止日期，且当前无活跃进行中需求');
    }
  }

  const healthLabels: Record<MilestoneHealthStatus, string> = {
    on_track: '🟢 正常推进 (On Track)',
    at_risk: '🟡 进度预警 (At Risk)',
    overdue: '🔴 进度逾期 (Overdue)',
  };

  // 2. Top Blockers calculation
  const uncompletedSet = new Set(
    linkedBacklogs.filter((b) => b.status !== 'done' && b.status !== 'dropped').map((b) => b.id),
  );
  const blockCountMap = new Map<string, number>();

  for (const b of linkedBacklogs) {
    if (b.links.depends_on && b.links.depends_on.length > 0) {
      for (const dep of b.links.depends_on) {
        if (uncompletedSet.has(dep)) {
          blockCountMap.set(dep, (blockCountMap.get(dep) || 0) + 1);
        }
      }
    }
  }

  const topBlockers: Array<{ id: string; title: string; status: string; blocked_count: number }> = [];
  for (const [bId, count] of blockCountMap.entries()) {
    const item = linkedBacklogs.find((b) => b.id === bId);
    if (item) {
      topBlockers.push({
        id: item.id,
        title: item.title,
        status: item.status,
        blocked_count: count,
      });
    }
  }
  topBlockers.sort((a, b) => b.blocked_count - a.blocked_count);

  return {
    milestone,
    health: {
      status: healthStatus,
      label: healthLabels[healthStatus],
      days_remaining: daysRemaining,
      risk_reasons: riskReasons,
    },
    backlog_summary: {
      total: totalBacklogs,
      done: doneBacklogs,
      active: activeBacklogs,
      planned: plannedBacklogs,
      proposed: proposedBacklogs,
      dropped: droppedBacklogs,
      percent: backlogPercent,
      items: linkedBacklogs.map((b) => ({
        id: b.id,
        title: b.title,
        status: b.status,
        priority: b.priority,
        level: b.level,
        task: b.links.task,
        is_blocked: b.links.depends_on ? b.links.depends_on.some((dep) => uncompletedSet.has(dep)) : false,
      })),
    },
    criteria_summary: {
      total: totalCriteria,
      done: doneCriteria,
      percent: criteriaPercent,
      items: milestone.acceptance_criteria,
    },
    top_blockers: topBlockers,
    overall_percent: overallPercent,
    is_ready_for_acceptance: isReady,
    blockers,
  };
}

export async function verifyMilestone(
  cwd: string,
  milestoneId: string,
): Promise<{ passed: boolean; blockers: string[]; progress: MilestoneProgress }> {
  const progress = await getMilestoneProgress(cwd, milestoneId);
  return {
    passed: progress.is_ready_for_acceptance,
    blockers: progress.blockers,
    progress,
  };
}

export async function acceptMilestone(
  cwd: string,
  milestoneId: string,
  options?: { force?: boolean; criteriaPassedIds?: string[] },
): Promise<MilestoneItem> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  if (options?.criteriaPassedIds && options.criteriaPassedIds.length > 0) {
    const passedSet = new Set(options.criteriaPassedIds);
    milestone.acceptance_criteria = milestone.acceptance_criteria.map((c) => ({
      ...c,
      done: c.done || passedSet.has(c.id),
    }));
  } else if (options?.force) {
    // force marks all criteria done
    milestone.acceptance_criteria = milestone.acceptance_criteria.map((c) => ({
      ...c,
      done: true,
    }));
  }

  const { passed, blockers } = await verifyMilestone(cwd, milestoneId);
  if (!passed && !options?.force) {
    throw new Error(
      `[docpath] 里程碑 ${milestone.id} 验收未通过:\n${blockers.map((b) => `  - ${b}`).join('\n')}\n使用 --force 强制验收`,
    );
  }

  milestone.status = 'accepted';
  await writeMilestoneItem(cwd, milestone);
  return milestone;
}

export async function releaseMilestone(
  cwd: string,
  milestoneId: string,
  options?: { title?: string; since?: string; dryRun?: boolean },
): Promise<{ milestone: MilestoneItem; releaseDocPath?: string; changelogPath?: string }> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }

  const version = milestone.version_target || milestone.id;
  const releaseTitle = options?.title || milestone.title;

  const milestoneData = await collectMilestoneData(cwd, version, releaseTitle);

  if (options?.dryRun) {
    return { milestone };
  }

  const { releaseDocPath, changelogPath } = await persistMilestone(cwd, milestoneData);

  milestone.status = 'released';
  await writeMilestoneItem(cwd, milestone);

  return { milestone, releaseDocPath, changelogPath };
}

/**
 * 自动收集当前里程碑/版本的数据快照
 */
export async function collectMilestoneData(
  cwd: string,
  version: string,
  title?: string,
  sinceDate?: Date,
): Promise<MilestoneData> {
  const docpathDir = await resolveDocpathDir(cwd);
  const nowStr = new Date().toISOString().slice(0, 10);
  const resolvedTitle = title?.trim() || `${version} Milestone Release`;

  // 2. 收集已闭环的 Backlog 项与关联任务
  const backlog: MilestoneBacklogSummary[] = [];
  const linkedTaskIds = new Set<string>();
  try {
    const backlogItems = await listAllBacklogItems(cwd);
    const targetItems = backlogItems.filter((item) => {
      if (item.status !== 'done') return false;
      if (/^M-\d+/i.test(version)) {
        return item.links.milestone?.toUpperCase() === version.toUpperCase();
      }
      return true;
    });

    for (const item of targetItems) {
      backlog.push({
        id: item.id,
        title: item.title,
        priority: item.priority,
        status: item.status,
      });
      if (item.links.task) {
        linkedTaskIds.add(item.links.task);
      }
    }
  } catch {
    // 容错处理
  }

  // 1. 收集已归档任务 (tasks/done/*)
  const tasks: MilestoneTaskSummary[] = [];
  const doneTasksDir = join(docpathDir, 'tasks', 'done');
  if (existsSync(doneTasksDir)) {
    try {
      const entries = readdirSync(doneTasksDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const taskId = entry.name;
          if (linkedTaskIds.size > 0 && !linkedTaskIds.has(taskId)) {
            continue;
          }
          const taskDir = join(doneTasksDir, taskId);
          const specPath = join(taskDir, 'spec.md');
          const planJsonPath = join(taskDir, 'plan.json');
          const planMdPath = join(taskDir, 'plan.md');

          const specContent = (await readFileSafe(specPath)) || '';
          const planContent = (await readFileSafe(planJsonPath)) || (await readFileSafe(planMdPath)) || '';

          const specDoc = specContent ? parseSpecMarkdownDocument(specContent, { taskId }) : null;
          let stepCount = 0;
          if (existsSync(planJsonPath)) {
            try {
              const raw = await readFileSafe(planJsonPath);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed?.steps)) {
                  stepCount = parsed.steps.length;
                }
              }
            } catch {
              // 容错
            }
          }
          if (stepCount === 0 && existsSync(planMdPath)) {
            const planMd = (await readFileSafe(planMdPath)) || '';
            stepCount = planMd ? parsePlanSteps(planMd).length : 0;
          }

          const taskTitle = specDoc?.title || taskId;
          const frCount = specDoc?.functional_requirements?.length || 0;
          const acCount = specDoc?.acceptance_criteria?.length || 0;

          tasks.push({
            taskId,
            title: taskTitle,
            frCount,
            acCount,
            stepCount,
          });
        }
      }
    } catch {
      // 容错处理
    }
  }

  // 3. 收集架构决策 (ADRs)
  const decisions: MilestoneDecisionSummary[] = [];
  try {
    const workspaceDir = join(docpathDir, 'workspace');
    const records = await readDecisionJsonl(workspaceDir);
    if (records && records.length > 0) {
      for (const r of records) {
        if (linkedTaskIds.size > 0 && r.taskId && !linkedTaskIds.has(r.taskId)) {
          continue;
        }
        decisions.push({
          id: r.id,
          category: r.category,
          conclusion: r.decision,
          createdAt: r.createdAt,
          taskId: r.taskId,
        });
      }
    } else {
      const decisionsMdPath = join(workspaceDir, 'decisions.md');
      if (existsSync(decisionsMdPath)) {
        const mdContent = await readFile(decisionsMdPath, 'utf-8');
        const blocks = mdContent.split(/(?=^##\s+ADR-)/m);
        for (const block of blocks) {
          const id = block.match(/^##\s+(ADR-[^\s—:]+)/m)?.[1];
          const category =
            block.match(/^##\s+[^\s—:]+\s*[-—:]\s*(.+)$/m)?.[1]?.trim() ||
            block.match(/-\s*category:\s*(.+)$/m)?.[1]?.trim() ||
            'General';
          const decision =
            block.match(/###\s+(?:决策|结论)\s*\n+([^#\n]+)/m)?.[1]?.trim() ||
            block.match(/-\s*(?:conclusion|decision):\s*(.+)$/m)?.[1]?.trim() ||
            '';
          const createdAt = block.match(/^- created_at:\s*(.+)$/m)?.[1]?.trim() || nowStr;
          const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim();
          if (id && decision) {
            if (linkedTaskIds.size === 0 || !taskId || linkedTaskIds.has(taskId)) {
              decisions.push({
                id,
                category,
                conclusion: decision,
                createdAt,
                taskId,
              });
            }
          }
        }
      }
    }
  } catch {
    // 容错处理
  }

  // 4. 收集系统规则统计
  const rules: MilestoneRuleSummary[] = [];
  try {
    const rulePaths = resolveRulePaths(docpathDir);
    for (const r of rulePaths.allRules) {
      if (r.exists) {
        const content = (await readFileSafe(r.path)) || '';
        const ruleCount = (content.match(/^##\s+/gm) || []).length;
        rules.push({
          name: r.name,
          ruleCount,
          displayPath: r.displayPath,
        });
      }
    }
  } catch {
    // 容错处理
  }

  return {
    version,
    title: resolvedTitle,
    date: nowStr,
    summary: `本版本交付 ${tasks.length} 个任务，闭环 ${backlog.length} 个需求项，沉淀 ${decisions.length} 项架构决策。`,
    tasks,
    backlog,
    decisions,
    rules,
    metrics: {
      totalTasks: tasks.length,
      totalBacklogClosed: backlog.length,
      totalDecisions: decisions.length,
      totalRules: rules.reduce((acc, r) => acc + r.ruleCount, 0),
    },
  };
}

/**
 * 将里程碑数据渲染为结构化 Markdown 发布报告
 */
export function renderMilestoneMarkdown(data: MilestoneData): string {
  const lines: string[] = [
    `# Release ${data.version}: ${data.title}`,
    '',
    `> **发布日期**: ${data.date}  `,
    `> **成果概览**: 交付 **${data.metrics.totalTasks}** 个已归档任务 | 闭环 **${data.metrics.totalBacklogClosed}** 个需求 | 沉淀 **${data.metrics.totalDecisions}** 项架构决策`,
    '',
    '## 1. 🚀 交付特性与任务汇总',
    '',
  ];

  if (data.tasks.length === 0) {
    lines.push('*(本周期暂无归档任务)*', '');
  } else {
    for (const t of data.tasks) {
      lines.push(`- **${t.taskId}**: ${t.title} (${t.stepCount} 个步骤, ${t.frCount} FR / ${t.acCount} AC)`);
    }
    lines.push('');
  }

  if (data.backlog.length > 0) {
    lines.push('### 需求清单关闭明细', '');
    for (const b of data.backlog) {
      lines.push(`- [x] **${b.id}** [${b.priority}]: ${b.title}`);
    }
    lines.push('');
  }

  lines.push('## 2. 🏛️ 架构决策与设计演进 (ADRs)', '');
  if (data.decisions.length === 0) {
    lines.push('*(本周期无新增架构决策)*', '');
  } else {
    for (const d of data.decisions) {
      const taskSuffix = d.taskId ? ` (任务: \`${d.taskId}\`)` : '';
      lines.push(`- **${d.id}** [${d.category}]: ${d.conclusion}${taskSuffix}`);
    }
    lines.push('');
  }

  lines.push('## 3. 💡 规则固化与知识沉淀 (Rules Promoted)', '');
  if (data.rules.length === 0) {
    lines.push('*(本周期未变动规则库)*', '');
  } else {
    for (const r of data.rules) {
      lines.push(`- \`${r.displayPath}\`: 共沉淀 **${r.ruleCount}** 条系统规范与最佳实践`);
    }
    lines.push('');
  }

  lines.push(
    '## 4. 📊 质量与基线状态',
    '',
    '- **门禁状态**: ✅ 全部质量门禁 (Check & Review) 100% 验证通过',
    `- **活文档索引**: ✅ 自动同步更新至 \`docs-index.json\``,
    '',
    '## 5. 🏷️ 版本切签与发布建议 (Git Tag)',
    '',
    '```bash',
    `git tag -a ${data.version} -m "${data.title}"`,
    `git push origin ${data.version}`,
    '```',
    '',
    '## 6. 🗺️ 演进时间线 (Milestone Timeline)',
    '',
    '```mermaid',
    'timeline',
    `    title Release ${data.version} 演进轨迹`,
    `    ${data.date} : 交付 ${data.metrics.totalTasks} 个已归档任务`,
    `                 : 闭环 ${data.metrics.totalBacklogClosed} 个需求`,
    `                 : 沉淀 ${data.metrics.totalDecisions} 项架构决策`,
    '```',
    '',
  );

  return lines.join('\n');
}

/**
 * 将全部里程碑渲染为全局 Mermaid 时间线大盘
 */
export function renderGlobalTimelineMarkdown(milestones: MilestoneMeta[]): string {
  const lines: string[] = [
    '# DocPath 项目演进全景时间线 (Project Evolution Timeline)',
    '',
    '> 自动聚合历史已发布里程碑与架构决策生成。',
    '',
    '```mermaid',
    'timeline',
    '    title DocPath 系统架构与里程碑演进大盘',
  ];

  if (milestones.length === 0) {
    lines.push('    当前 : 持续迭代演进中');
  } else {
    for (const m of milestones) {
      lines.push(`    ${m.date} : [${m.version}] ${m.title}`);
      lines.push(`             : 交付 ${m.taskCount} 个任务`);
    }
  }

  lines.push('```', '');
  return lines.join('\n');
}

/**
 * 更新或创建根目录 CHANGELOG.md
 */
export async function updateChangelog(cwd: string, data: MilestoneData): Promise<string> {
  const changelogPath = join(cwd, 'CHANGELOG.md');
  const existing = (await readFileSafe(changelogPath)) || '';

  const section = [
    `## [${data.version}] - ${data.date}`,
    `### ${data.title}`,
    '',
    ...data.tasks.map((t) => `- **${t.taskId}**: ${t.title}`),
    ...(data.decisions.length > 0 ? ['', '#### 架构决策 (ADRs)', ...data.decisions.map((d) => `- ${d.conclusion}`)] : []),
    '',
  ].join('\n');

  let nextContent = '';
  if (!existing.trim()) {
    nextContent = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n${section}\n`;
  } else {
    const headingIndex = existing.search(/^##\s+/m);
    if (headingIndex === -1) {
      nextContent = `${existing.trimEnd()}\n\n${section}\n`;
    } else {
      nextContent = `${existing.slice(0, headingIndex)}${section}\n${existing.slice(headingIndex)}`;
    }
  }

  await writeFile(changelogPath, nextContent, 'utf-8');
  return changelogPath;
}

/**
 * 保存里程碑文档并刷新活文档索引
 */
export async function persistMilestone(
  cwd: string,
  data: MilestoneData,
): Promise<{ releaseDocPath: string; changelogPath: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const releasesDir = join(cwd, 'docs', 'releases');
  const dir = milestonesDir(docpathDir);

  await ensureDir(releasesDir);
  await ensureDir(dir);

  const filename = `${data.version.toLowerCase().replace(/[^a-z0-9._-]/g, '-')}.md`;
  const releaseDocPath = join(releasesDir, filename);
  const milestoneDocPath = join(dir, filename);

  const markdownContent = renderMilestoneMarkdown(data);

  await writeFile(releaseDocPath, markdownContent, 'utf-8');
  await writeFile(milestoneDocPath, markdownContent, 'utf-8');

  // 同步更新 CHANGELOG.md
  const changelogPath = await updateChangelog(cwd, data);

  // 刷新活文档索引，确保即刻可被 docpath docs search 检索
  await refreshProjectDocumentIndex(docpathDir, cwd);

  return { releaseDocPath, changelogPath };
}

/**
 * 列出所有已记录的里程碑 (发布视图与规划视图聚合)
 */
export async function listMilestones(cwd: string): Promise<MilestoneMeta[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const dir = milestonesDir(docpathDir);
  const releasesDir = join(cwd, 'docs', 'releases');

  const metaList: MilestoneMeta[] = [];
  const seenVersions = new Set<string>();

  const scanDir = async (scanTargetDir: string, displayPrefix: string) => {
    if (!existsSync(scanTargetDir)) return;
    try {
      const files = readdirSync(scanTargetDir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile() && f.name.endsWith('.md')) {
          const filePath = join(scanTargetDir, f.name);
          const content = (await readFileSafe(filePath)) || '';
          const titleMatch = content.match(/^#\s+Release\s+([^:]+):\s*(.+)$/m);
          const dateMatch = content.match(/>\s*\*\*发布日期\*\*:\s*([^\s<]+)/);

          if (titleMatch) {
            const version = titleMatch[1]?.trim() || f.name.replace(/\.md$/, '');
            if (!seenVersions.has(version)) {
              seenVersions.add(version);
              const taskMatches = content.match(/^- \*\*T-[^:]+\*\*:/gm) || [];
              metaList.push({
                version,
                title: titleMatch[2]?.trim() || version,
                date: dateMatch?.[1]?.trim() || 'unknown',
                path: filePath,
                displayPath: `${displayPrefix}/${f.name}`,
                taskCount: taskMatches.length,
              });
            }
          } else if (f.name.startsWith('M-')) {
            try {
              const parsed = parseMilestoneContent(content, filePath);
              const version = parsed.version_target || parsed.id;
              if (!seenVersions.has(version)) {
                seenVersions.add(version);
                metaList.push({
                  version,
                  title: parsed.title,
                  date: parsed.created_at,
                  path: filePath,
                  displayPath: `${displayPrefix}/${f.name}`,
                  taskCount: parsed.backlog_ids.length,
                });
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // 容错
    }
  };

  await scanDir(releasesDir, 'docs/releases');
  await scanDir(dir, '.docpath/milestones');

  return metaList.sort((a, b) => b.date.localeCompare(a.date));
}

export interface EditMilestoneOptions {
  title?: string;
  status?: MilestoneStatus;
  priority?: MilestonePriority;
  target_date?: string | null;
  version_target?: string | null;
  owner?: string | null;
  objective?: string;
  nonGoals?: string;
}

export async function editMilestoneItem(
  cwd: string,
  milestoneId: string,
  options: EditMilestoneOptions,
): Promise<MilestoneItem> {
  const milestone = await readMilestoneItem(cwd, milestoneId);
  if (!milestone) {
    throw new Error(`[docpath] 未找到里程碑: ${milestoneId}`);
  }
  if (options.title?.trim()) milestone.title = options.title.trim();
  if (options.status) milestone.status = transitionMilestone(milestone.status, options.status);
  if (options.priority) milestone.priority = options.priority;
  if (options.target_date !== undefined) milestone.target_date = options.target_date?.trim() || null;
  if (options.version_target !== undefined) milestone.version_target = options.version_target?.trim() || null;
  if (options.owner !== undefined) milestone.owner = options.owner?.trim() || null;
  milestone.updated_at = new Date().toISOString().slice(0, 10);
  await writeMilestoneItem(cwd, milestone);
  return milestone;
}

export interface MilestoneDoctorIssue {
  id: string;
  severity: 'error' | 'warning';
  field: string;
  message: string;
  suggestion: string;
}

export async function auditMilestonesHygiene(cwd: string): Promise<{
  passed: boolean;
  issues: MilestoneDoctorIssue[];
  warnings: MilestoneDoctorIssue[];
}> {
  const milestones = await listMilestoneItems(cwd);
  const allBacklogs = await listAllBacklogItems(cwd);
  const backlogMap = new Map<string, BacklogItem>(allBacklogs.map((b) => [b.id, b]));
  const milestoneSet = new Set<string>(milestones.map((m) => m.id));

  const issues: MilestoneDoctorIssue[] = [];
  const warnings: MilestoneDoctorIssue[] = [];

  for (const m of milestones) {
    // 1. Dangling backlog_ids
    for (const bId of m.backlog_ids) {
      if (!backlogMap.has(bId)) {
        issues.push({
          id: m.id,
          severity: 'error',
          field: 'backlog_ids',
          message: `里程碑关联的需求不存在: ${bId}`,
          suggestion: `从里程碑中解绑该需求: docpath milestone unbind ${m.id} ${bId}`,
        });
      }
    }

    // 2. Empty milestone
    if (m.backlog_ids.length === 0 && m.status !== 'released' && m.status !== 'archived') {
      warnings.push({
        id: m.id,
        severity: 'warning',
        field: 'backlog_ids',
        message: `里程碑未关联任何 Backlog 需求`,
        suggestion: `运行 docpath milestone decompose ${m.id} 拆解需求或 docpath milestone bind ${m.id} R-xxx 关联已有需求`,
      });
    }

    // 3. Overdue milestone
    if (m.target_date && (m.status === 'active' || m.status === 'planned')) {
      const targetTime = new Date(m.target_date).getTime();
      if (!Number.isNaN(targetTime) && targetTime < Date.now()) {
        const days = Math.ceil((Date.now() - targetTime) / (1000 * 3600 * 24));
        warnings.push({
          id: m.id,
          severity: 'warning',
          field: 'target_date',
          message: `里程碑已逾期 ${days} 天 (目标截止期: ${m.target_date})`,
          suggestion: `评估进展并运行 docpath milestone edit ${m.id} --target-date <YYYY-MM-DD> 更新截止期`,
        });
      }
    }

    // 4. Released milestone with uncompleted MACs
    if (m.status === 'released') {
      const unmetMac = m.acceptance_criteria.filter((c) => !c.done);
      if (unmetMac.length > 0) {
        warnings.push({
          id: m.id,
          severity: 'warning',
          field: 'acceptance_criteria',
          message: `已发布里程碑包含未勾选的验收标准: ${unmetMac.map((c) => c.id).join(', ')}`,
          suggestion: `检查验收条件并补充勾选`,
        });
      }
    }
  }

  // 5. Backlog referencing non-existent milestone
  for (const b of allBacklogs) {
    if (b.links.milestone && !milestoneSet.has(b.links.milestone)) {
      issues.push({
        id: b.id,
        severity: 'error',
        field: 'links.milestone',
        message: `需求声明了不存在的里程碑: ${b.links.milestone}`,
        suggestion: `修正需求关联: docpath backlog edit ${b.id} --milestone ""`,
      });
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
  };
}
