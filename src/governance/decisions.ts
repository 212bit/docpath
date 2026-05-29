/**
 * decisionsLog — 自动化决策日志 (借鉴 Trellis)
 *
 * 每次关键操作自动追加决策记录到 decisions.md
 */

import { existsSync } from 'fs';
import { readFile, writeFile, appendFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';

/**
 * 追加一条决策记录
 */
export async function appendDecision(
  cwd: string,
  category: string,
  decision: string,
  reasoning?: string,
): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);
  const decisionsPath = join(docpathDir, 'workspace', 'decisions.md');

  // 如果文件不存在，创建头部
  if (!existsSync(decisionsPath)) {
    await writeFile(decisionsPath, '# 决策日志 — DocPath 自动归档\n\n> 每次关键操作自动追加决策记录。\n\n---\n\n', 'utf-8');
  }

  const entry = [
    `## ${category} — ${new Date().toISOString()}`,
    '',
    `**决策**: ${decision}`,
    reasoning ? `**理由**: ${reasoning}` : '',
    '',
    '---',
    '',
  ].filter(Boolean).join('\n');

  await appendFile(decisionsPath, entry, 'utf-8');
}

/**
 * 读取最近 N 条决策
 */
export async function getRecentDecisions(cwd: string, count: number = 5): Promise<string[]> {
  const docpathDir = await resolveDocpathDir(cwd);
  const decisionsPath = join(docpathDir, 'workspace', 'decisions.md');
  if (!existsSync(decisionsPath)) return [];

  const content = await readFile(decisionsPath, 'utf-8');
  const blocks = content.split(/^## /m).filter(Boolean).slice(-count);
  return blocks.map(b => '## ' + b.trim());
}
