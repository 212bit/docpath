/**
 * scan-existing CLAUDE.md 项目命令区块 (FR-3 / S6)
 *
 * 把 S4 提取的 test/build/format/lint 命令清单写入根 CLAUDE.md 末尾的
 * `## 项目命令（由 init --scan-existing 生成）`区块。写边界按 spec §4.e:
 *   - 不存在 CLAUDE.md → 新建（仅含本区块）
 *   - 已存在且无本区块锚点 → 仅在末尾追加本区块，不动其他内容
 *   - 已存在且已有本区块锚点 → 按标题锚点替换旧区块，不重复堆积（AC-7）
 *   - 缺命令槽位标注 `TODO: 未探测到 <slot> 命令，请确认`，不静默不编造
 *
 * 不带 scan-existing 时 init 不调用本模块 (NFR-1)。
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProjectCommands, CommandSlot, ExtractedCommand } from './scan-existing-commands.js';

const UTF8 = { encoding: 'utf-8' as const };

const CLAUDE_MD = 'CLAUDE.md';

/** 区块锚点标题（AC-7 以此为替换边界）。稳定不变，请勿随意改动。 */
export const PROJECT_COMMANDS_ANCHOR = '## 项目命令（由 init --scan-existing 生成）';

const SLOT_LABELS: Record<CommandSlot, string> = {
  test: '测试 (test)',
  build: '构建 (build)',
  format: '格式化 (format)',
  lint: '检查 (lint)',
};

/**
 * 渲染项目命令区块正文（不含锚点后的全部行）。缺命令 → TODO 行。
 * 直接返回字符串，不落盘。
 */
export function renderProjectCommandsBlock(cmds: ProjectCommands): string {
  const order: CommandSlot[] = ['test', 'build', 'format', 'lint'];
  const lines: string[] = [PROJECT_COMMANDS_ANCHOR, ''];
  lines.push('<!-- 由 `docpath init --scan-existing` 从项目 manifest 提取（package.json scripts / Cargo.toml /',
    'go.mod / pom.xml / Makefile 等）。未探测到的槽位标 TODO，请人工确认；勿编造。 -->');
  lines.push('');
  for (const slot of order) {
    const c: ExtractedCommand = cmds[slot];
    const label = SLOT_LABELS[slot];
    if (c.command) {
      lines.push(`- \`${label}\`: \`${c.command}\`  <!-- 来源: ${c.source} -->`);
    } else {
      lines.push(`- \`${label}\`: TODO: 未探测到 ${slot} 命令，请确认`);
    }
  }
  return lines.join('\n');
}

export interface WriteClaudeResult {
  /** written: 新建并写入；appended: 末尾追加；replaced: 锚点替换；noop: 无 commands 可写。 */
  outcome: 'written' | 'appended' | 'replaced' | 'noop';
  path: string;
  reason?: string;
}

/**
 * 在根 CLAUDE.md 写入项目命令区块（§4.e / AC-7）。
 *
 * 幂等：重复运行按锚点标题替换旧区块，不堆积。无 commands（S4 抛错或全空）且
 * CLAUDE.md 已存在仍会写入 TODO 区块 —— 缺命令也应当被显式记录而非静默。
 */
export async function writeProjectCommandsBlock(cwd: string, cmds: ProjectCommands): Promise<WriteClaudeResult> {
  const path = join(cwd, CLAUDE_MD);
  const block = renderProjectCommandsBlock(cmds);

  const existing = existsSync(path) ? await readFile(path, 'utf-8') : null;

  if (existing === null) {
    // 不存在 → 新建（仅含本区块）
    mkdirSync(dirname(path), { recursive: true });
    await writeFile(path, `${block}\n`, UTF8);
    return { outcome: 'written', path };
  }

  const anchorIdx = existing.indexOf(PROJECT_COMMANDS_ANCHOR);

  if (anchorIdx === -1) {
    // 无锚点 → 末尾追加（先 trim 尾部空白再追加两个换行）
    const trimmed = existing.replace(/\s+$/, '');
    await writeFile(path, `${trimmed}\n\n${block}\n`, UTF8);
    return { outcome: 'appended', path };
  }

  // 有锚点 → 按标题锚点替换到下一个 `## ` 标题前或文件末尾（AC-7 不堆积）
  // before = 锚点之前的全部内容；after = 锚点区块之后的内容（下一个 ## 起或 EOF）
  const afterAnchorStart = anchorIdx + PROJECT_COMMANDS_ANCHOR.length;
  const tail = existing.slice(afterAnchorStart);
  // tail 内寻找下一个顶格 `## ` 标题（不含当前锚点自身）
  const nextHeadingRel = tail.search(/\n## /);
  let afterBlock: string;
  if (nextHeadingRel === -1) {
    afterBlock = ''; // 锚点是文件最后区块
  } else {
    // 保留从下一个标题起新行起的内容
    const cutRel = afterAnchorStart + nextHeadingRel + 1; // +1 跳过前导换行，停在下一个 `##`
    afterBlock = existing.slice(cutRel);
  }

  const before = existing.slice(0, anchorIdx);
  const beforeTrimmed = before.replace(/\s+$/, '');
  const sep = beforeTrimmed.length > 0 ? '\n\n' : '';
  const newContent = afterBlock
    ? `${beforeTrimmed}${sep}${block}\n\n${afterBlock}`
    : `${beforeTrimmed}${sep}${block}\n`;
  await writeFile(path, newContent, UTF8);
  return { outcome: 'replaced', path };
}
