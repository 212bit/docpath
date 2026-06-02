/**
 * docpath backlog — 需求条目管理
 */

import { stringify } from 'yaml';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type BacklogItem,
  type BacklogPriority,
  type BacklogStatus,
  createBacklogItem,
  isBacklogPriority,
  listBacklogItems,
  readBacklogItem,
  refreshBacklogIndex,
  setBacklogStatus,
  transitionBacklog,
  writeBacklogItem,
} from '../engine/backlog.js';
import { today, resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { archivedTaskDir, canonicalTaskRelativePath, canonicalTaskDir, currentTaskDir, writeActiveTaskFile } from '../utils/task-files.js';

interface BacklogCommandOptions {
  cwd: string;
  action?: string;
  id?: string;
  title?: string;
  priority?: string;
  level?: string;
  status?: string;
  agent?: boolean;
}

function normalizePriority(priority?: string): BacklogPriority {
  const value = (priority || 'P2').toUpperCase();
  if (!isBacklogPriority(value)) {
    throw new Error(`docpath backlog add: priority 非法: ${priority}（允许: P0|P1|P2|P3）`);
  }
  return value;
}

function normalizeLevel(level?: string): number {
  const raw = level ?? '2';
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3) {
    throw new Error(`docpath backlog add: level 非法: ${raw}（允许: 0|1|2|3）`);
  }
  return parsed;
}

function normalizeStatusFilter(status?: string): BacklogStatus | undefined {
  if (!status) return undefined;
  const value = status.trim().toLowerCase();
  const valid: BacklogStatus[] = ['proposed', 'accepted', 'planned', 'active', 'done', 'dropped'];
  if (!valid.includes(value as BacklogStatus)) {
    throw new Error(`docpath backlog list: status 非法: ${status}`);
  }
  return value as BacklogStatus;
}

function comparePriority(a: BacklogPriority, b: BacklogPriority): number {
  return Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10);
}

function sortBacklogItems(items: BacklogItem[]): BacklogItem[] {
  return [...items].sort((a, b) => {
    const priorityOrder = comparePriority(a.priority, b.priority);
    if (priorityOrder !== 0) return priorityOrder;
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

function slugifyTask(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'task';
}

function baseTaskId(title: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `T-${date}-${slugifyTask(title)}`;
}

function taskIdExists(docpathDir: string, taskId: string): boolean {
  return existsSync(canonicalTaskDir(docpathDir, taskId)) || existsSync(archivedTaskDir(docpathDir, taskId));
}

function generateUniqueTaskId(docpathDir: string, title: string): string {
  const base = baseTaskId(title);
  if (!taskIdExists(docpathDir, base)) return base;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taskIdExists(docpathDir, candidate)) return candidate;
  }

  throw new Error(`docpath backlog promote: 无法为标题生成唯一 task_id: ${title}`);
}

function renderPromotedSpec(item: BacklogItem, taskId: string): string {
  return [
    `# ${taskId} - ${item.title}`,
    '',
    `> backlog_id: ${item.id}`,
    `> backlog_source: ${item.source || 'unknown'}`,
    '',
    '## 1. 背景与动机',
    '',
    item.body.trim() || '- 待补充',
    '',
    '## 2. 需求清单',
    '',
    '### 功能需求',
    `- [ ] FR-1: ${item.title}`,
    `  - 来源 backlog: ${item.id}`,
    '',
    '### 非功能需求',
    '- [ ] NFR-1: 保持与现有 DocPath 工作流兼容',
    '',
    '## 3. 范围界定',
    '',
    '### 包含',
    `- ${item.title}`,
    '',
    '### 不包含',
    '- 待在后续规划中补充',
    '',
    '## 4. 关键决策',
    '',
    '| # | 决策 | 选项 | 结论 | 理由 |',
    '|---|------|------|------|------|',
    '| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |',
    '',
    '## 5. 验收标准',
    '',
    '- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`',
    `- [ ] AC-2: backlog 条目 ${item.id} 与任务 ${taskId} 建立双向关联`,
    '',
    '---',
    '',
    '*此文件由 `docpath backlog promote` 生成。*',
    '',
  ].join('\n');
}

async function backlogAdd(options: BacklogCommandOptions): Promise<void> {
  if (!options.title?.trim()) {
    throw new Error('docpath backlog add requires --title <title>');
  }

  const item = await createBacklogItem(options.cwd, {
    title: options.title.trim(),
    status: 'proposed',
    priority: normalizePriority(options.priority),
    level: normalizeLevel(options.level),
    source: 'docpath backlog add',
    links: {
      task: null,
      spec: null,
    },
    created_at: today(),
    body: [
      '## 背景',
      '',
      '- 待补充',
      '',
      '## 验收',
      '',
      '- 待补充',
    ].join('\n'),
  });

  console.log(`✅  已创建 backlog 条目: ${item.id}`);
  console.log(`   title: ${item.title}`);
  console.log(`   priority: ${item.priority}`);
  console.log(`   level: ${item.level}`);
}

async function backlogPromote(options: BacklogCommandOptions): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error('docpath backlog promote requires <id>');
  }

  const current = await readCurrentState(options.cwd);
  if (current && current.phase !== 'idle' && current.phase !== 'completed') {
    throw new Error(`docpath backlog promote: 当前已有活跃任务（phase=${current.phase}），请先 done 或 park`);
  }

  const item = await readBacklogItem(options.cwd, options.id.trim());
  if (!item) {
    throw new Error(`docpath backlog promote: backlog 条目不存在: ${options.id}`);
  }
  if (item.links.task) {
    throw new Error(`docpath backlog promote: backlog 条目 ${item.id} 已关联任务 ${item.links.task}`);
  }

  const docpathDir = await resolveDocpathDir(options.cwd);
  const nextStatus = transitionBacklog(item.status, 'active');
  const taskId = generateUniqueTaskId(docpathDir, item.title);
  const tasksCurrentDir = currentTaskDir(docpathDir);
  const planPath = join(tasksCurrentDir, 'plan.md');

  await mkdir(tasksCurrentDir, { recursive: true });
  if (existsSync(planPath)) {
    await rm(planPath, { force: true });
  }

  const specContent = renderPromotedSpec(item, taskId);
  await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  item.status = nextStatus;
  item.links.task = taskId;
  item.links.spec = canonicalTaskRelativePath(taskId, 'spec.md');
  await writeBacklogItem(options.cwd, item);
  await refreshBacklogIndex(options.cwd);
  await transitionWorkflow(options.cwd, 'task.created', {
    taskId,
    taskTitle: item.title,
    currentStep: `backlog promote ${item.id} 完成，下一步: docpath plan`,
  });

  console.log(`✅  已 promote backlog 条目: ${item.id}`);
  console.log(`   task_id: ${taskId}`);
  console.log(`   spec: .docpath/${canonicalTaskRelativePath(taskId, 'spec.md')}`);
}

async function backlogAdvanceStatus(
  options: BacklogCommandOptions,
  target: 'accepted' | 'planned',
): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error(`docpath backlog ${target === 'accepted' ? 'accept' : 'plan'} requires <id>`);
  }

  const item = await setBacklogStatus(options.cwd, options.id.trim(), target);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
}

async function backlogUpdateTerminalStatus(
  options: BacklogCommandOptions,
  target: 'done' | 'dropped',
): Promise<void> {
  if (!options.id?.trim()) {
    throw new Error(`docpath backlog ${target === 'done' ? 'done' : 'drop'} requires <id>`);
  }

  const item = await setBacklogStatus(options.cwd, options.id.trim(), target);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 条目已更新: ${item.id} → ${item.status}`);
}

function renderListTable(items: BacklogItem[]): string {
  const lines = [
    '',
    '📚  Backlog 条目',
    '',
    '| id | priority | status | level | title | task |',
    '|----|----------|--------|-------|-------|------|',
  ];

  for (const item of items) {
    lines.push(
      `| ${item.id} | ${item.priority} | ${item.status} | ${item.level} | ${item.title} | ${item.links.task ?? ''} |`
    );
  }

  if (items.length === 0) {
    lines.push('| - | - | - | - | 暂无条目 | - |');
  }

  lines.push('');
  return lines.join('\n');
}

async function backlogList(options: BacklogCommandOptions): Promise<void> {
  const status = normalizeStatusFilter(options.status);
  const priority = options.priority ? normalizePriority(options.priority) : undefined;
  const filtered = sortBacklogItems(
    (await listBacklogItems(options.cwd)).filter((item) => {
      if (status && item.status !== status) return false;
      if (priority && item.priority !== priority) return false;
      return true;
    })
  );

  if (options.agent) {
    console.log(stringify({
      count: filtered.length,
      items: filtered.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        level: item.level,
        task: item.links.task,
      })),
    }));
    return;
  }

  console.log(renderListTable(filtered));
}

async function backlogRefresh(options: BacklogCommandOptions): Promise<void> {
  const items = await listBacklogItems(options.cwd);
  await refreshBacklogIndex(options.cwd);
  console.log(`✅  backlog 索引已刷新: ${items.length} 个条目`);
  console.log('   index: .docpath/backlog/backlog.md');
}

export async function backlogCommand(options: BacklogCommandOptions): Promise<void> {
  const action = options.action?.trim().toLowerCase();
  if (!action) {
    throw new Error('docpath backlog requires <add|list|refresh|accept|plan|promote|done|drop>');
  }

  switch (action) {
    case 'add':
      await backlogAdd(options);
      return;
    case 'list':
      await backlogList(options);
      return;
    case 'refresh':
      await backlogRefresh(options);
      return;
    case 'promote':
      await backlogPromote(options);
      return;
    case 'accept':
      await backlogAdvanceStatus(options, 'accepted');
      return;
    case 'plan':
      await backlogAdvanceStatus(options, 'planned');
      return;
    case 'done':
      await backlogUpdateTerminalStatus(options, 'done');
      return;
    case 'drop':
      await backlogUpdateTerminalStatus(options, 'dropped');
      return;
    default:
      throw new Error(`docpath backlog: unsupported action ${action}（允许: add|list|refresh|accept|plan|promote|done|drop）`);
  }
}
