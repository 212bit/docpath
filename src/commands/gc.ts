/**
 * docpath:gc — 清理历史任务目录。
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { listBacklogItems } from '../engine/backlog.js';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';

interface GcOptions {
  cwd: string;
  force?: boolean;
  delete?: boolean;
}

interface GcCandidate {
  taskId: string;
  path: string;
  targetPath: string;
  reason: string;
}

function isTaskDirName(name: string): boolean {
  return /^T-\d{8}(?:-|$)/.test(name);
}

async function collectProtectedTaskIds(cwd: string): Promise<Set<string>> {
  const protectedIds = new Set<string>();
  const state = await readCurrentState(cwd);
  if (state?.task_id) protectedIds.add(state.task_id);

  const backlog = await listBacklogItems(cwd);
  for (const item of backlog) {
    if (item.status === 'active' && item.links.task) {
      protectedIds.add(item.links.task);
    }
  }

  return protectedIds;
}

export async function gcCommand(options: GcOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const tasksDir = join(docpathDir, 'tasks');
  const doneDir = join(tasksDir, 'done');

  if (!existsSync(tasksDir)) {
    throw new Error('未找到 .docpath/tasks 目录，请先运行 docpath init');
  }

  const protectedTaskIds = await collectProtectedTaskIds(cwd);
  const entries = await readdir(tasksDir, { withFileTypes: true });
  const candidates: GcCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'current' || entry.name === 'done') continue;
    if (!isTaskDirName(entry.name)) continue;
    if (protectedTaskIds.has(entry.name)) continue;

    candidates.push({
      taskId: entry.name,
      path: join(tasksDir, entry.name),
      targetPath: join(doneDir, entry.name),
      reason: '非活跃历史任务目录',
    });
  }

  console.log('\n🧹  DocPath GC\n');
  console.log(`模式: ${options.force ? (options.delete ? 'delete' : 'archive') : 'dry-run'}`);
  console.log(`候选目录: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log('✅  没有可清理的历史任务目录');
    return;
  }

  for (const candidate of candidates) {
    console.log(`- ${candidate.taskId}`);
    console.log(`  from: ${candidate.path}`);
    console.log(`  ${options.delete ? 'delete' : 'to'}: ${candidate.targetPath}`);
    console.log(`  reason: ${candidate.reason}`);
  }

  if (!options.force) {
    console.log('\n[dry-run] 未修改文件。实际归档运行: docpath gc --force');
    return;
  }

  await mkdir(doneDir, { recursive: true });
  for (const candidate of candidates) {
    if (options.delete) {
      await rm(candidate.path, { recursive: true, force: true });
      continue;
    }
    if (existsSync(candidate.targetPath)) {
      await rm(candidate.targetPath, { recursive: true, force: true });
    }
    await rename(candidate.path, candidate.targetPath);
  }

  console.log(`\n✅  已${options.delete ? '删除' : '归档'} ${candidates.length} 个历史任务目录`);
}
