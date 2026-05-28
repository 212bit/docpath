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

/**
 * 更新 current.md 的状态字段
 */
export async function updateCurrentState(
  cwd: string,
  newState: string,
  extraFields?: Record<string, string>,
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const currentPath = join(docpathDir, 'workspace', 'current.md');
  let content: string;

  try {
    content = await readFile(currentPath, 'utf-8');
  } catch {
    console.error('⚠️  current.md 不存在，请先运行 docpath:init');
    return;
  }

  // 替换 state 字段
  content = content.replace(
    /state: .+/,
    `state: ${newState.padEnd(19)}# 当前状态`,
  );

  // 替换 updated_at
  const now = new Date().toISOString().slice(0, 16);
  content = content.replace(
    /updated_at: .+/,
    `updated_at: ${now}`,
  );

  // 替换额外字段；字段不存在时插入到 YAML 状态块末尾，保持向后兼容
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      const regex = new RegExp(`^${key}:.*$`, 'm');
      if (regex.test(content)) {
        content = content.replace(regex, `${key}: ${value}`);
      } else {
        content = content.replace(/```\n/, `${key}: ${value}\n\`\`\`\n`);
      }
    }
  }

  await writeFile(currentPath, content, 'utf-8');
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
