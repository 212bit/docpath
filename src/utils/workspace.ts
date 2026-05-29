/**
 * Workspace 工具函数 — .docpath/ 状态读写
 *
 * 方案 B：state.json 为唯一状态真源，current.md 为只读渲染产物
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';
import { resolveDocpathDir } from './file.js';

// ── state.json schema ──

interface EscalationInfo {
  /** 最近评估的推荐级别 (0-3) */
  recommended_level: number;
  /** 评估时间 */
  evaluated_at: string;
  /** 触发的规则名称 */
  triggered_rule?: string;
  /** 置信度 0.0-1.0 */
  confidence?: number;
}

interface CurrentState {
  level: number;
  state: string;
  task_id: string;
  task_title: string;
  phase: string;
  current_step: string;
  started_at: string;
  updated_at: string;
  /** Escalation 引擎评估结果（可选） */
  escalation?: EscalationInfo;
}

// ── 核心读写函数 ──

/**
 * 读取 .docpath/workspace/state.json（方案 B：唯一状态真源）
 * 如果 state.json 不存在但 current.md 存在，自动迁移并写入 state.json
 */
export async function readCurrentState(cwd: string): Promise<CurrentState | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const statePath = join(docpathDir, 'workspace', 'state.json');
  const currentPath = join(docpathDir, 'workspace', 'current.md');

  // 优先读 state.json
  if (existsSync(statePath)) {
    try {
      const content = await readFile(statePath, 'utf-8');
      return JSON.parse(content) as CurrentState;
    } catch {
      // state.json 损坏，回退到 current.md 迁移
    }
  }

  // 迁移逻辑：从 current.md 读取并写入 state.json
  if (existsSync(currentPath)) {
    const legacy = await readLegacyCurrentMd(cwd);
    if (legacy) {
      await writeFile(statePath, JSON.stringify(legacy, null, 2), 'utf-8');
      return legacy;
    }
  }

  return null;
}

/**
 * 写入 state.json + 重建 current.md（方案 B：唯一写入路径）
 */
export async function writeCurrentState(cwd: string, state: CurrentState): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const statePath = join(docpathDir, 'workspace', 'state.json');
  const currentPath = join(docpathDir, 'workspace', 'current.md');

  // 写入 state.json
  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf-8');

  // 重建 current.md
  const planContent = await readOptionalFile(join(docpathDir, 'tasks', 'current', 'plan.md'));
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const breadcrumbContent = await readOptionalFile(join(docpathDir, 'workspace', 'breadcrumb.md'));

  const rendered = renderCurrentDocument(
    convertStateToFields(state),
    planContent,
    state.task_id || 'current',
    extractLastCheckSummary(lastCheckContent),
    extractLatestBreadcrumbSummary(breadcrumbContent),
    state.escalation,
  );
  await writeFile(currentPath, rendered, 'utf-8');
}

// ── 兼容别名（保持现有调用者不变） ──

/**
 * 读取 .docpath/workspace/current.md 的状态块
 * @deprecated 请使用 readCurrentState()，此函数仅为兼容保留
 */
export async function readCurrentMd(cwd: string): Promise<CurrentState | null> {
  return readCurrentState(cwd);
}

// ── 内部辅助函数 ──

/**
 * 从旧版 current.md YAML 块读取状态（迁移用）
 */
async function readLegacyCurrentMd(cwd: string): Promise<CurrentState | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  try {
    const content = await readFile(currentPath, 'utf-8');
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) return null;

    const yamlBlock = yamlMatch[1];
    const stripInlineComment = (value: string): string => {
      let inSingle = false;
      let inDouble = false;

      for (let i = 0; i < value.length; i++) {
        const char = value[i];
        const prev = value[i - 1];

        if (char === '"' && !inSingle && prev !== '\\') inDouble = !inDouble;
        if (char === "'" && !inDouble && prev !== '\\') inSingle = !inSingle;
        if (char === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(prev))) {
          return value.slice(0, i).trim();
        }
      }

      return value.trim();
    };
    const unquote = (value: string): string => {
      const trimmed = stripInlineComment(value);
      if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
          (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    };
    const get = (key: string): string => {
      const m = yamlBlock.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
      return m ? unquote(m[1]) : '';
    };

    return {
      level: parseInt(get('level'), 10) || 0,
      state: get('state'),
      task_id: get('task_id'),
      task_title: get('task_title'),
      phase: get('phase'),
      current_step: get('current_step'),
      started_at: get('started_at'),
      updated_at: get('updated_at'),
    };
  } catch {
    return null;
  }
}

type CurrentStateFields = {
  level: string;
  state: string;
  task_id: string;
  task_title: string;
  phase: string;
  current_step: string;
  started_at: string;
  updated_at: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseFrontMatterLine(content: string, key: string): string {
  const match = content.match(new RegExp(`^>\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, 'im'));
  return match ? match[1].replace(/`/g, '').trim() : '';
}

function firstHeading(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function normalizeTaskTitle(title: string): string {
  return title
    .replace(/^Spec:\s*/i, '')
    .replace(/^Plan:\s*/i, '')
    .replace(/^执行计划:\s*/i, '')
    .trim();
}

function extractPlanChecklist(plan: string): string[] {
  const items: string[] = [];
  for (const line of plan.split('\n')) {
    const match = line.match(/^\s*-\s*\[( |x|X|✓)\]\s+(.+?)\s*$/);
    if (!match) continue;
    const checked = match[1] !== ' ';
    const text = match[2].replace(/\s+/g, ' ').trim();
    items.push(`- [${checked ? 'x' : ' '}] ${text}`);
  }
  return items;
}

function relativeTaskLink(taskId: string, file: string): string {
  return `../tasks/${taskId}/${file}`;
}

function workspaceLink(file: string): string {
  return `./${file}`;
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

function firstNonEmptyLineAfterHeading(content: string, heading: string): string {
  const lines = content.split('\n');
  const headingIndex = lines.findIndex(line => line.trim() === heading);
  if (headingIndex === -1) return '';

  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) break;
    return trimmed;
  }

  return '';
}

function extractLastCheckSummary(content: string): string {
  const time = content.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim();
  const result = content.match(/^\*\*结果\*\*:\s*(.+)$/m)?.[1]?.trim();
  const count = content.match(/^\*\*检查项\*\*:\s*(.+)$/m)?.[1]?.trim();
  if (!time && !result && !count) return '暂无 last-check.md 证据';
  return [result, count ? `${count} 项` : '', time].filter(Boolean).join(' · ');
}

function extractLatestBreadcrumbSummary(content: string): string {
  const lines = content.split('\n');
  const headingIndexes = lines
    .map((line, index) => /^###\s+/.test(line.trim()) ? index : -1)
    .filter(index => index !== -1);
  const headingIndex = headingIndexes.at(-1);
  if (headingIndex === undefined) return '暂无 breadcrumb.md 记录';

  const nextHeadingIndex = lines.findIndex((line, index) => index > headingIndex && /^###\s+/.test(line.trim()));
  const blockEnd = nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
  const heading = lines[headingIndex].replace(/^###\s+/, '').trim();
  const block = lines.slice(headingIndex + 1, blockEnd).join('\n');
  const status = block.match(/^-\s+\*\*状态\*\*:\s*(.+)$/m)?.[1]?.trim();
  const context = block.match(/^-\s+\*\*上下文\*\*:\s*(.+)$/m)?.[1]?.trim();
  return [heading, status ? `状态: ${status}` : '', context].filter(Boolean).join(' · ');
}

function convertStateToFields(state: CurrentState): CurrentStateFields {
  return {
    level: String(state.level),
    state: state.state,
    task_id: state.task_id,
    task_title: state.task_title,
    phase: state.phase,
    current_step: state.current_step,
    started_at: state.started_at,
    updated_at: state.updated_at,
  };
}

async function collectCurrentStateFields(
  cwd: string,
  newState: string,
  extraFields?: Record<string, string>,
): Promise<{ fields: CurrentStateFields; planContent: string; taskDirName: string; lastCheckSummary: string; breadcrumbSummary: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const lastCheckPath = join(docpathDir, 'workspace', 'last-check.md');
  const breadcrumbPath = join(docpathDir, 'workspace', 'breadcrumb.md');
  const specContent = await readOptionalFile(specPath);
  const planContent = await readOptionalFile(planPath);
  const lastCheckContent = await readOptionalFile(lastCheckPath);
  const breadcrumbContent = await readOptionalFile(breadcrumbPath);

  const previous = await readCurrentState(cwd);
  const specTaskId = parseFrontMatterLine(specContent, 'Task ID');
  const planTaskId = parseFrontMatterLine(planContent, 'Task ID');
  const taskId = extraFields?.task_id || specTaskId || planTaskId || previous?.task_id || 'unknown';
  const title = extraFields?.task_title ||
    normalizeTaskTitle(firstHeading(specContent) || firstHeading(planContent)) ||
    previous?.task_title ||
    taskId;
  const now = new Date().toISOString().slice(0, 16);

  const fields: CurrentStateFields = {
    level: String(previous?.level || 3),
    state: newState,
    task_id: taskId,
    task_title: title,
    phase: extraFields?.phase || previous?.phase || newState,
    current_step: extraFields?.current_step || previous?.current_step || '待确认下一步',
    started_at: previous?.started_at || new Date().toISOString(),
    updated_at: now,
  };

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      if (key in fields) {
        fields[key as keyof CurrentStateFields] = value;
      }
    }
  }

  return {
    fields,
    planContent,
    taskDirName: taskId !== 'unknown' ? taskId : 'current',
    lastCheckSummary: extractLastCheckSummary(lastCheckContent),
    breadcrumbSummary: extractLatestBreadcrumbSummary(breadcrumbContent),
  };
}

function renderCurrentDocument(
  fields: CurrentStateFields,
  planContent: string,
  taskDirName: string,
  lastCheckSummary: string,
  breadcrumbSummary: string,
  escalation?: EscalationInfo,
): string {
  const checklist = extractPlanChecklist(planContent);
  const checklistBlock = checklist.length > 0
    ? checklist.join('\n')
    : '- [ ] 暂无 plan.md checklist，请补充 `.docpath/tasks/current/plan.md`';

  return `# 📍 当前工作流状态

\`\`\`yaml
level: ${fields.level}
state: ${fields.state.padEnd(19)}# 当前状态
task_id: ${fields.task_id}
task_title: ${fields.task_title}
phase: ${fields.phase}
current_step: ${fields.current_step}
started_at: ${fields.started_at}
updated_at: ${fields.updated_at}
\`\`\`

> 📖 规约: [spec.md](${relativeTaskLink(taskDirName, 'spec.md')})
> 📋 计划: [plan.md](${relativeTaskLink(taskDirName, 'plan.md')})

## ✅ 执行检查清单

${checklistBlock}

## 🧾 最近验证证据

- Last Check: [last-check.md](${workspaceLink('last-check.md')}) — ${lastCheckSummary}
- Breadcrumb: [breadcrumb.md](${workspaceLink('breadcrumb.md')}) — ${breadcrumbSummary}

${escalation ? `## 📈 Escalation 评估

- **推荐级别**: ${escalation.recommended_level}
${escalation.triggered_rule ? `- **触发规则**: ${escalation.triggered_rule}` : ''}
${escalation.confidence !== undefined ? `- **置信度**: ${escalation.confidence.toFixed(2)}` : ''}
- **评估时间**: ${escalation.evaluated_at}

` : ''}## 🔄 同步说明

本文件由 DocPath CLI 根据 \`.docpath/workspace/state.json\` 自动重建。
状态变化请通过 \`docpath go/check/journal\` 等命令推进，避免手工修改后与任务文档漂移。
`;
}

/**
 * 更新状态（方案 B：写入 state.json + 重建 current.md）
 */
export async function updateCurrentState(
  cwd: string,
  newState: string,
  extraFields?: Record<string, string>,
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');

  if (!existsSync(currentPath)) {
    console.error('⚠️  current.md 不存在，请先运行 docpath:init');
    return;
  }

  const { fields, planContent, taskDirName, lastCheckSummary, breadcrumbSummary } = await collectCurrentStateFields(cwd, newState, extraFields);
  
  // 保留已有 escalation 字段（不会被 extraFields 覆盖）
  const existingState = await readCurrentState(cwd);

  const state: CurrentState = {
    level: parseInt(fields.level, 10) || 0,
    state: fields.state,
    task_id: fields.task_id,
    task_title: fields.task_title,
    phase: fields.phase,
    current_step: fields.current_step,
    started_at: fields.started_at,
    updated_at: fields.updated_at,
    escalation: existingState?.escalation,
  };
  
  await writeCurrentState(cwd, state);
}

/**
 * 重建 current.md 正文但保持当前状态字段；用于修复/同步已有工作区
 */
export async function syncCurrentDocument(cwd: string): Promise<void> {
  const current = await readCurrentState(cwd);
  if (!current) {
    console.error('⚠️  state.json 和 current.md 均不存在，请先运行 docpath:init');
    return;
  }
  
  // 直接重建 current.md
  const docpathDir = await resolveDocpathDir(cwd);
  const planContent = await readOptionalFile(join(docpathDir, 'tasks', 'current', 'plan.md'));
  const lastCheckContent = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const breadcrumbContent = await readOptionalFile(join(docpathDir, 'workspace', 'breadcrumb.md'));

  const rendered = renderCurrentDocument(
    convertStateToFields(current),
    planContent,
    current.task_id || 'current',
    extractLastCheckSummary(lastCheckContent),
    extractLatestBreadcrumbSummary(breadcrumbContent),
    current.escalation,
  );
  
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  await writeFile(currentPath, rendered, 'utf-8');
}

/**
 * 交互询问
 */
export async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * 读取 workspace 元数据 (.docpath/workspace.json)
 */
export async function readWorkspaceMeta(cwd: string): Promise<Record<string, unknown> | null> {
  const docpathDir = await resolveDocpathDir(cwd);
  const metaPath = join(docpathDir, 'workspace.json');
  try {
    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
