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

export interface PromptBlock {
  task: string;
  system: string;
  context: Record<string, string>;
  instructions: string[];
  output_format: string;
}

/**
 * 输出结构化 prompt 到 stdout（YAML 格式，供宿主 Agent 消费）
 */
export function emitPrompt(block: PromptBlock): void {
  console.log('\n```yaml');
  console.log(`task: ${block.task}`);
  console.log(`system: |`);
  // 缩进 system prompt
  for (const line of block.system.split('\n')) {
    console.log(`  ${line}`);
  }
  console.log('context:');
  for (const [key, value] of Object.entries(block.context)) {
    if (!value) continue;
    console.log(`  ${key}: |`);
    const lines = value.split('\n');
    const truncated = lines.length > 100
      ? [...lines.slice(0, 100), `... (${lines.length - 100} lines truncated)`]
      : lines;
    for (const line of truncated) {
      console.log(`    ${line}`);
    }
  }
  console.log('instructions:');
  for (const inst of block.instructions) {
    console.log(`  - ${inst}`);
  }
  console.log(`output_format: ${block.output_format}`);
  console.log('```\n');
}

/**
 * 读取任务文件（spec/plan/current），返回空串兜底
 */
export async function readTaskFile(cwd: string, relativePath: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  const filePath = join(docpathDir, relativePath);
  if (!existsSync(filePath)) return '';
  return readFile(filePath, 'utf-8');
}

/**
 * 读取 git diff（支持 staged / last_commit / all）
 */
export function getGitDiff(scope: string, cwd: string): string {
  const { execSync } = require('child_process');
  try {
    const cmd = scope === 'staged'
      ? 'git diff --cached 2>/dev/null || git diff'
      : scope === 'last_commit'
        ? 'git diff HEAD~1..HEAD 2>/dev/null || echo "no commits"'
        : 'git diff origin/main..HEAD 2>/dev/null || git log --oneline -20';
    return execSync(cmd, { cwd, encoding: 'utf-8', timeout: 10000 });
  } catch {
    return '(git diff not available)';
  }
}
