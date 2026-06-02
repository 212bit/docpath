/**
 * docpath:tasks — active task 文件别名管理。
 */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, syncCurrentDocument } from '../utils/workspace.js';
import { detectActiveTaskFileDrift, syncActiveTaskFiles } from '../utils/task-files.js';

interface TasksOptions {
  cwd: string;
  action: string;
  from?: 'canonical' | 'current';
}

export async function tasksCommand(options: TasksOptions): Promise<void> {
  const { cwd, action } = options;
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    throw new Error('未找到 .docpath/ 目录。请先运行 `docpath init`');
  }

  const current = await readCurrentState(cwd);
  if (!current?.task_id) {
    throw new Error('当前没有活跃 task_id，无法检测或同步 tasks/current');
  }

  if (action === 'drift') {
    const drifts = await detectActiveTaskFileDrift(docpathDir, current.task_id);
    if (drifts.length === 0) {
      console.log('✅  tasks/current 与 canonical 任务目录一致');
      return;
    }
    console.log('❌  检测到 tasks/current 与 canonical 任务目录漂移：');
    for (const drift of drifts) {
      console.log(`- ${drift.file}: ${drift.reason}`);
      console.log(`  current: ${drift.currentPath}`);
      console.log(`  canonical: ${drift.canonicalPath}`);
    }
    console.log('\n修复建议: docpath tasks sync --from canonical 或 docpath tasks sync --from current');
    throw new Error(`tasks/current drift detected: ${drifts.map((drift) => drift.file).join(', ')}`);
  }

  if (action === 'sync') {
    const from = options.from || 'canonical';
    if (!['canonical', 'current'].includes(from)) {
      throw new Error('docpath tasks sync --from 仅支持 canonical 或 current');
    }
    const synced = await syncActiveTaskFiles(docpathDir, current.task_id, from);
    await syncCurrentDocument(cwd);
    console.log(`✅  已同步 active task 文件 (${from} -> ${from === 'canonical' ? 'current' : 'canonical'})`);
    for (const item of synced) {
      console.log(`- ${item.file}`);
      console.log(`  from: ${item.fromPath}`);
      console.log(`  to:   ${item.toPath}`);
    }
    return;
  }

  throw new Error(`Unsupported tasks action: ${action}. Expected drift | sync`);
}
