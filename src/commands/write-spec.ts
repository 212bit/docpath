/**
 * docpath:write-spec — 写入 spec.md
 *
 * 接受 spec 内容（通过参数或 stdin），写入 .docpath/tasks/current/spec.md，
 * 并更新状态为 brainstorming → planning。
 */

import { existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { updateCurrentState } from '../utils/workspace.js';

interface WriteSpecOptions {
  cwd: string;
  /** spec 内容（YAML/Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
}

export async function writeSpecCommand(options: WriteSpecOptions): Promise<void> {
  const { cwd, content } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  // 读取内容：优先参数，否则 stdin
  let specContent = content || '';

  if (!specContent && options.stdin !== false) {
    // 从 stdin 读取
    specContent = await readStdin();
  }

  if (!specContent.trim()) {
    console.error('❌  未提供 spec 内容。用法：');
    console.error('   docpath write-spec --content "..."');
    console.error('   echo "..." | docpath write-spec --stdin');
    process.exit(1);
  }

  // 确保 tasks/current 目录存在
  const tasksCurrentDir = join(docpathDir, 'tasks', 'current');
  await mkdir(tasksCurrentDir, { recursive: true });

  // 写入 spec.md
  const specPath = join(tasksCurrentDir, 'spec.md');
  await writeFile(specPath, specContent, 'utf-8');

  console.log(`✅  spec.md 已写入: ${specPath}`);

  // 更新状态为 drafting → planning（brainstorm 完成）
  await updateCurrentState(cwd, 'drafting', { substep: 'spec-written' });
  console.log('📌  状态已更新为 drafting (spec-written)');
  console.log('📌  下一步运行: docpath plan\n');
}

/**
 * 从 stdin 读取全部内容
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
    // 如果 stdin 是 TTY（无管道），立即返回
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}
