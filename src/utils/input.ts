/**
 * 需求输入读取 — fail-loud。
 *
 * brainstorm / refine 用它读取 [file] 位置参数或 --file 选项指向的需求文档。
 * 关键约定：一旦调用方指定了文件，就必须读到内容，否则抛错——绝不静默回退到空需求。
 * （修复 D-P0.1：此前 brainstorm 会把传入的文件路径直接丢弃，无声成功。）
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * 读取需求文件内容。文件不存在或为空时抛错。
 * @param cwd  解析相对路径的基准目录
 * @param file 文件路径（相对 cwd 或绝对）
 */
export async function readRequirementFile(cwd: string, file: string): Promise<string> {
  const filePath = resolve(cwd, file);
  if (!existsSync(filePath)) {
    throw new Error(`需求文件不存在: ${filePath}`);
  }
  const text = await readFile(filePath, 'utf-8');
  if (!text.trim()) {
    throw new Error(`需求文件为空: ${filePath}`);
  }
  return text;
}
