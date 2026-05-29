/**
 * Workspace 工具函数 — .docpath/ 状态读写
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import * as readline from 'readline';
import { resolveDocpathDir } from './file.js';

/**
 * 读取 .docpath/workspace/current.md 的状态块
 */
export async function readCurrentMd(cwd: string): Promise<{
  level: number;
  state: string;
  task_id: string;
  task_title: string;
  phase: string;
  current_step: string;
  started_at: string;
  updated_at: string;
} | null> {
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

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return '';
  }
}

async function collectCurrentStateFields(
  cwd: string,
  newState: string,
  extraFields?: Record<string, string>,
): Promise<{ fields: CurrentStateFields; planContent: string; taskDirName: string }> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  const existing = await readOptionalFile(currentPath);
  const previous = await readCurrentMd(cwd);
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');
  const specContent = await readOptionalFile(specPath);
  const planContent = await readOptionalFile(planPath);

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

  const existingTaskLink = existing.match(/\.\.\/tasks\/([^/)]+)\/(?:spec|plan)\.md/);
  return { fields, planContent, taskDirName: taskId !== 'unknown' ? taskId : (existingTaskLink?.[1] || 'current') };
}

function renderCurrentDocument(fields: CurrentStateFields, planContent: string, taskDirName: string): string {
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

## 🔄 同步说明

本文件由 DocPath CLI 根据 \`.docpath/tasks/current/spec.md\` 与 \`.docpath/tasks/current/plan.md\` 重建。
状态变化请通过 \`docpath go/check/journal\` 等命令推进，避免手工修改后与任务文档漂移。
`;
}

/**
 * 更新 current.md 的状态字段，并从 tasks/current 重建正文，避免 current.md 与 spec/plan 漂移
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

  const { fields, planContent, taskDirName } = await collectCurrentStateFields(cwd, newState, extraFields);
  await writeFile(currentPath, renderCurrentDocument(fields, planContent, taskDirName), 'utf-8');
}

/**
 * 重建 current.md 正文但保持当前状态字段；用于修复/同步已有工作区
 */
export async function syncCurrentDocument(cwd: string): Promise<void> {
  const current = await readCurrentMd(cwd);
  if (!current) return;
  await updateCurrentState(cwd, current.state || 'unknown', {
    phase: current.phase,
    current_step: current.current_step,
    task_id: current.task_id,
    task_title: current.task_title,
  });
}

/**
 * 更新 current.md 的 checklist 项（checkbox 状态）
 */
export async function updateCurrentChecklist(
  cwd: string,
  taskId: string,
  completed: boolean,
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  let content: string;

  try {
    content = await readFile(currentPath, 'utf-8');
  } catch {
    return;
  }

  // 替换 [ ] ↔ [✓]
  if (completed) {
    content = content.replace('[ ]', '[✓]');
  } else {
    content = content.replace('[✓]', '[ ]');
  }

  await writeFile(currentPath, content, 'utf-8');
}

/**
 * 交互式问答（CLI 模式）
 */
export async function askQuestion(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
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
