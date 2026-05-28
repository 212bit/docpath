/**
 * DocPath 文件工具
 */

import { readFile, writeFile, mkdir, access, constants } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** 确保目录存在 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/** 文件是否存在 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** 写入文件（自动创建父目录） */
export async function writeFileSafe(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, 'utf-8');
}

/** 读取模板文件内容 */
export async function loadTemplate(templatePath: string): Promise<string> {
  return await readFile(templatePath, 'utf-8');
}

/** 安全读取文件，不存在返回 null */
export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/** 生成任务 ID (T-YYYYMMDD-xxx) */
export function generateTaskId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 5);
  return `T-${dateStr}-${randomSuffix}`;
}

/** 获取当前日期 YYYY-MM-DD */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
