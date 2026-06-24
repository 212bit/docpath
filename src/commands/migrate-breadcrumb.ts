/**
 * 迁移命令：将全局 breadcrumb.jsonl 拆分到各任务目录
 *
 * 用于从双写模式迁移到任务级优先架构。
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { readFile, mkdir } from 'fs/promises';
import { writeFileAtomic } from '../utils/file.js';

interface BreadcrumbEntry {
  taskId: string;
  step: string;
  status: 'done' | 'in_progress' | 'blocked' | 'skipped';
  context: string;
  timestamp?: string;
  sessionId?: string;
  escalation?: string;
}

interface BreadcrumbJsonlRecord extends BreadcrumbEntry {
  schema_version: number;
  kind: 'breadcrumb';
  timestamp: string;
}

async function readGlobalBreadcrumbJsonl(projectRoot: string): Promise<BreadcrumbEntry[]> {
  const path = join(projectRoot, '.docpath', 'workspace', 'breadcrumb.jsonl');
  if (!existsSync(path)) return [];

  const content = await readFile(path, 'utf-8');
  const entries: BreadcrumbEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as BreadcrumbJsonlRecord;
      entries.push({
        taskId: record.taskId,
        step: record.step,
        status: record.status,
        context: record.context,
        timestamp: record.timestamp,
        ...(record.sessionId ? { sessionId: record.sessionId } : {}),
        ...(record.escalation ? { escalation: record.escalation } : {}),
      });
    } catch (error) {
      console.warn(`⚠️  跳过无效 JSON 行: ${line.slice(0, 50)}...`);
    }
  }

  return entries;
}

async function writeTaskBreadcrumbJsonl(
  projectRoot: string,
  taskId: string,
  entries: BreadcrumbEntry[],
): Promise<void> {
  if (!/^[A-Za-z0-9._-]+$/.test(taskId)) {
    console.warn(`⚠️  跳过无效 taskId: ${taskId}`);
    return;
  }

  const taskDir = join(projectRoot, '.docpath', 'tasks', taskId);
  if (!existsSync(taskDir)) {
    console.warn(`⚠️  任务目录不存在，跳过: ${taskId}`);
    return;
  }

  const path = join(taskDir, 'breadcrumb.jsonl');
  const content = entries
    .map((entry) =>
      JSON.stringify({
        schema_version: 1,
        kind: 'breadcrumb',
        taskId: entry.taskId,
        step: entry.step,
        status: entry.status,
        context: entry.context,
        timestamp: entry.timestamp || new Date().toISOString(),
        ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
        ...(entry.escalation ? { escalation: entry.escalation } : {}),
      }),
    )
    .join('\n');

  await mkdir(taskDir, { recursive: true });
  await writeFileAtomic(path, content ? `${content}\n` : '');
}

export async function migrateBreadcrumbToTaskLevel(projectRoot: string): Promise<void> {
  console.log('🔄 开始迁移全局 breadcrumb 到任务级...\n');

  const globalEntries = await readGlobalBreadcrumbJsonl(projectRoot);
  if (globalEntries.length === 0) {
    console.log('✅ 全局 breadcrumb.jsonl 为空或不存在，无需迁移');
    return;
  }

  console.log(`📊 全局文件共 ${globalEntries.length} 条记录`);

  const byTask = new Map<string, BreadcrumbEntry[]>();
  for (const entry of globalEntries) {
    if (!entry.taskId) continue;
    if (!byTask.has(entry.taskId)) byTask.set(entry.taskId, []);
    byTask.get(entry.taskId)!.push(entry);
  }

  console.log(`📦 涉及 ${byTask.size} 个任务\n`);

  let migratedCount = 0;
  let skippedCount = 0;

  for (const [taskId, entries] of byTask) {
    const taskPath = join(projectRoot, '.docpath', 'tasks', taskId, 'breadcrumb.jsonl');
    if (existsSync(taskPath)) {
      console.log(`⏭️  ${taskId}: 已存在任务级文件，跳过 (${entries.length} 条)`);
      skippedCount++;
      continue;
    }

    await writeTaskBreadcrumbJsonl(projectRoot, taskId, entries);
    console.log(`✅ ${taskId}: 写入 ${entries.length} 条`);
    migratedCount++;
  }

  console.log(`\n✅ 迁移完成:`);
  console.log(`   - 已迁移: ${migratedCount} 个任务`);
  console.log(`   - 已跳过: ${skippedCount} 个任务（已有任务级文件）`);
  console.log(`\n💡 提示: 全局 breadcrumb.jsonl 已保留，可手动删除或留作备份`);
}

export async function run(options: { cwd: string }): Promise<void> {
  await migrateBreadcrumbToTaskLevel(options.cwd);
}
