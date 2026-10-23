/**
 * DocPath 文件工具
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir, access, rename, constants } from 'node:fs/promises';
import { join, dirname, resolve, isAbsolute, relative } from 'node:path';

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

/**
 * 原子写入：先写 `.tmp` 再 rename 到目标路径。
 *
 * rename 在同一文件系统上是原子操作，因此并发读者只会看到「旧的完整内容」
 * 或「新的完整内容」，绝不会读到写到一半的截断文件。用于派生产物
 * （current.md、breadcrumb 轮转）等无法靠锁保护、但必须保持文件完整性的写入。
 *
 * 注意：这只保证「单次写的原子性」，不保证「读-改-写序列的原子性」——
 * 后者由 {@link withLock} 负责。
 */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, content, 'utf-8');
  await rename(tmpPath, filePath);
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

interface LinkInfo {
  linkedTo: string;
  createdAt: string;
}

/**
 * 解析 .docpath/ 目录路径
 * 如果 .docpath/docpath.json 存在且有 linkedTo 字段，则解析为链接目标
 * 否则返回本地 .docpath/ 路径
 */
export function resolveDocpathDirSync(cwd: string): string {
  const localDocpath = join(cwd, '.docpath');
  const linkFile = join(localDocpath, 'docpath.json');

  let linkContent: string | null = null;
  try {
    linkContent = readFileSync(linkFile, 'utf-8');
  } catch {
    linkContent = null;
  }

  if (linkContent) {
    try {
      const info: LinkInfo = JSON.parse(linkContent);
      if (info.linkedTo) {
        const targetDir = isAbsolute(info.linkedTo)
          ? info.linkedTo
          : resolve(cwd, info.linkedTo);
        if (existsSync(join(targetDir, '.docpath', 'config.yaml'))) {
          return join(targetDir, '.docpath');
        }
        console.warn(`⚠️  链接目标 ${targetDir} 的 .docpath/ 不存在，使用本地配置`);
      }
    } catch {
      // JSON 解析失败，忽略链接
    }
  }

  return localDocpath;
}

export async function resolveDocpathDir(cwd: string): Promise<string> {
  return resolveDocpathDirSync(cwd);
}

/**
 * 创建项目链接
 * @param cwd 当前项目目录
 * @param targetPath 链接目标项目路径
 */
export async function createLink(cwd: string, targetPath: string): Promise<void> {
  if (!await exists(join(targetPath, '.docpath', 'config.yaml'))) {
    throw new Error(`目标项目 ${targetPath} 未初始化 DocPath（缺少 .docpath/config.yaml）`);
  }

  const localDocpath = join(cwd, '.docpath');
  await ensureDir(localDocpath);

  const absoluteTarget = resolve(cwd, targetPath);
  const relativePath = relative(localDocpath, absoluteTarget).replace(/\\/g, '/');
  const info: LinkInfo = {
    linkedTo: relativePath,
    createdAt: new Date().toISOString(),
  };

  await writeFile(join(localDocpath, 'docpath.json'), JSON.stringify(info, null, 2), 'utf-8');
}

/**
 * 删除文件
 */
export async function rmFile(filePath: string): Promise<void> {
  const { unlink } = await import('node:fs/promises');
  try {
    await unlink(filePath);
  } catch {
    // 文件不存在，忽略
  }
}

/**
 * 解除项目链接
 */
export async function removeLink(cwd: string): Promise<void> {
  const linkFile = join(cwd, '.docpath', 'docpath.json');
  const { unlink } = await import('node:fs/promises');
  try {
    await unlink(linkFile);
  } catch {
    // 文件不存在，忽略
  }
}
