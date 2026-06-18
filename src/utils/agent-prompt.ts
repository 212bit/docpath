/**
 * Agent Prompt Output — 替代内置 LLM
 *
 * CLI 只负责：收集上下文 + 输出结构化 prompt
 * 宿主 Agent 负责：读取 prompt → 推理 → 写回结果
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from './file.js';
import { readCurrentState } from './workspace.js';
import { readActiveTaskFile } from './task-files.js';

export interface PromptBlock {
  task: string;
  system: string;
  context: Record<string, string>;
  instructions: string[];
  output_format: string;
}

export type PromptWriter = (content: string) => void;

export function renderPrompt(block: PromptBlock): string {
  const lines: string[] = ['', '```yaml'];
  lines.push(`task: ${block.task}`);
  lines.push('system: |');
  for (const line of block.system.split('\n')) {
    lines.push(`  ${line}`);
  }
  lines.push('context:');
  for (const [key, value] of Object.entries(block.context)) {
    if (!value) continue;
    lines.push(`  ${key}: |`);
    const contextLines = value.split('\n');
    const truncated = contextLines.length > 100
      ? [...contextLines.slice(0, 100), `... (${contextLines.length - 100} lines truncated)`]
      : contextLines;
    for (const line of truncated) {
      lines.push(`    ${line}`);
    }
  }
  lines.push('instructions:');
  for (const inst of block.instructions) {
    lines.push(`  - ${inst}`);
  }
  if (block.output_format) {
    lines.push('output_format: |');
    for (const line of block.output_format.split('\n')) {
      lines.push(`  ${line}`);
    }
  }
  lines.push('```', '', '');
  return lines.join('\n');
}

/**
 * 输出结构化 prompt 到 stdout（YAML 格式，供宿主 Agent 消费）
 */
export function emitPrompt(block: PromptBlock, writer: PromptWriter = (content) => process.stdout.write(content)): void {
  writer(renderPrompt(block));
}

/**
 * 读取任务文件（spec/plan/current），返回空串兜底
 */
export async function readTaskFile(cwd: string, relativePath: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const current = await readCurrentState(cwd);
  if (relativePath === 'spec.md' || relativePath === 'plan.md') {
    return readActiveTaskFile(docpathDir, current?.task_id, relativePath);
  }
  if (relativePath === 'tasks/current/spec.md') {
    return readActiveTaskFile(docpathDir, current?.task_id, 'spec.md');
  }
  if (relativePath === 'tasks/current/plan.md') {
    return readActiveTaskFile(docpathDir, current?.task_id, 'plan.md');
  }
  const filePath = join(docpathDir, relativePath);
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf-8');
}
