/**
 * 协议共享契约段注入（R-300 方案 B）。
 *
 * templates/protocols/blocks/<name>.md 是共享契约段的唯一手写源；
 * flavor canonical（templates/protocols/<flavor>.md）中以
 *   <!-- docpath:block <name> --> … <!-- /docpath:block -->
 * 标记的注入区由渲染器从块源重渲染（幂等）。
 *
 * 治理分层：canonical↔blocks 的一致性归 check（fail-loud 指向
 * `docpath render --view protocols`，gate 不写盘）；root 副本↔canonical
 * 归既有 install manifest drift 机制，互不重叠。
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PROTOCOL_FLAVORS = ['CLAUDE.md', 'AGENTS.md', 'CODEX.md', 'OPENCODE.md'] as const;

const BLOCK_OPEN = /^<!-- docpath:block ([a-z0-9-]+) -->$/;
const BLOCK_CLOSE = '<!-- /docpath:block -->';

export interface ProtocolBlockRenderResult {
  content: string;
  /** 注入区被重渲染（内容有变化）的块名 */
  updated: string[];
  /** 标记引用但块源不存在的块名（fail-loud 素材） */
  unknown: string[];
  /** 文件中出现的全部注入块名 */
  present: string[];
}

/** 读取块源目录；不存在返回 null（非 DocPath 开发仓库场景）。 */
export async function readProtocolBlocks(blocksDir: string): Promise<Record<string, string> | null> {
  if (!existsSync(blocksDir)) return null;
  const blocks: Record<string, string> = {};
  for (const file of await readdir(blocksDir)) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    blocks[file.replace(/\.md$/, '')] = (await readFile(join(blocksDir, file), 'utf-8')).replace(/\s+$/, '');
  }
  return blocks;
}

/**
 * 对单个 flavor 内容重渲染全部注入区（幂等）。
 * 开标记必须独占一行；闭标记前的原内容整体替换为块源内容。
 * 缺闭标记 fail-loud（残缺标记比静默跳过更危险）。
 */
export function renderProtocolBlocks(content: string, blocks: Record<string, string>): ProtocolBlockRenderResult {
  const lines = content.split('\n');
  const out: string[] = [];
  const updated: string[] = [];
  const unknown: string[] = [];
  const present: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(BLOCK_OPEN);
    if (!match) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const name = match[1];
    present.push(name);
    const closeIndex = lines.indexOf(BLOCK_CLOSE, i + 1);
    if (closeIndex === -1) {
      throw new Error(`[docpath] protocol block "${name}" 缺少闭标记 ${BLOCK_CLOSE}`);
    }
    const previous = lines.slice(i + 1, closeIndex).join('\n');
    if (!(name in blocks)) {
      unknown.push(name);
      out.push(...lines.slice(i, closeIndex + 1));
      i = closeIndex + 1;
      continue;
    }
    const rendered = blocks[name];
    if (previous !== rendered) updated.push(name);
    out.push(lines[i], rendered, BLOCK_CLOSE);
    i = closeIndex + 1;
  }
  return { content: out.join('\n'), updated, unknown, present };
}

export interface ProtocolBlocksSyncReport {
  available: boolean;
  files: Array<{ file: string; updated: string[]; unknown: string[]; present: string[] }>;
}

/**
 * 校验或同步全部 flavor canonical 的注入区。
 * write=false 仅报告（check 校验用）；write=true 落盘（render 命令用）。
 */
export async function syncProtocolBlocks(
  templatesDir: string,
  options: { write: boolean },
): Promise<ProtocolBlocksSyncReport> {
  const protocolsDir = join(templatesDir, 'protocols');
  const blocks = await readProtocolBlocks(join(protocolsDir, 'blocks'));
  if (!blocks) return { available: false, files: [] };

  const files: ProtocolBlocksSyncReport['files'] = [];
  for (const flavor of PROTOCOL_FLAVORS) {
    const path = join(protocolsDir, flavor);
    if (!existsSync(path)) continue;
    const content = await readFile(path, 'utf-8');
    const result = renderProtocolBlocks(content, blocks);
    if (options.write && result.updated.length > 0) {
      await writeFile(path, result.content, 'utf-8');
    }
    files.push({ file: flavor, updated: result.updated, unknown: result.unknown, present: result.present });
  }
  return { available: true, files };
}
