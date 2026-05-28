/**
 * docpath:unlink — 取消关联项目
 */

import { join } from 'node:path';
import { resolveDocpathDir, exists, rmFile } from '../utils/file.js';
import { readFile } from 'node:fs/promises';

interface UnlinkOptions {
  cwd?: string;
}

export async function unlinkCommand(options: UnlinkOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const docpathDir = await resolveDocpathDir(cwd);

  // 检查是否有关联
  const linkFile = join(docpathDir, 'docpath.json');
  if (!(await exists(linkFile))) {
    console.log('ℹ️  当前项目未关联其他项目');
    return;
  }

  try {
    const raw = await readFile(linkFile, 'utf-8');
    const linkInfo = JSON.parse(raw);

    if (!linkInfo.linkedTo) {
      console.log('ℹ️  当前项目未关联其他项目');
      return;
    }

    const targetPath = linkInfo.linkedTo;
    await rmFile(linkFile);

    // 尝试删除 .docpath/ 目录（如果为空）
    try {
      const { readdir } = await import('node:fs/promises');
      const files = await readdir(docpathDir);
      if (files.length === 0) {
        const { rmdir } = await import('node:fs/promises');
        await rmdir(docpathDir);
      }
    } catch {
      // 目录不为空，保留
    }

    console.log('🔗  已取消关联: ' + targetPath);
    console.log('    项目现在使用独立的 .docpath/\n');
  } catch (error) {
    console.error('❌  取消关联失败:', (error as Error).message);
  }
}
