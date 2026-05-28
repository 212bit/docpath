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
    const get = (key: string): string => {
      const m = yamlBlock.match(new RegExp(`${key}:\\s*(.+)`));
      return m ? m[1].trim().replace(/"/g, '') : '';
    };

    return {
      level: parseInt(get('level'), 10) || 0,
      state: get('state'),
      task_id: get('task_id'),
      task_title: get('task_title'),
      phase: get('phase'),
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

  // 替换额外字段
  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      const regex = new RegExp(`${key}: .+`);
      if (regex.test(content)) {
        content = content.replace(regex, `${key}: ${value}`);
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
  const metaPath = join(docpathDir, 'workspace.json');
  try {
    const content = await readFile(metaPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
