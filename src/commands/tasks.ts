/**
 * docpath:tasks — active task 文件别名管理。
 */

import { existsSync } from 'fs';
import { resolveDocpathDir } from '../utils/file.js';
import { readCurrentState, syncCurrentDocument } from '../utils/workspace.js';
import { detectActiveTaskFileDrift, detectActiveTaskIdentityDrift, formatTaskIdentityDrift, syncActiveTaskFiles } from '../utils/task-files.js';

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
    const identityDrifts = await detectActiveTaskIdentityDrift(docpathDir, current.task_id);
    if (identityDrifts.length > 0) {
      console.log(`❌  ${formatTaskIdentityDrift(identityDrifts)}`);
      throw new Error(`task identity drift detected: ${identityDrifts.map((drift) => `${drift.location}/${drift.file}`).join(', ')}`);
    }

    const drifts = await detectActiveTaskFileDrift(docpathDir, current.task_id);
    if (drifts.length === 0) {
      console.log('✅  tasks/current 与 canonical 任务目录一致');
      return;
    }

    const phantom = drifts.filter((drift) => drift.reason === 'phantom-task');
    if (phantom.length > 0) {
      console.log('❌  检测到幽灵任务漂移：state.task_id 指向当前 checkout 不存在的任务');
      console.log(`  state.task_id: ${current.task_id}`);
      console.log(`  phase: ${current.phase}`);
      console.log('  current 别名与 canonical 任务目录均不存在（spec.md/plan.md 全缺）。');
      console.log('  常见成因: 任务在另一分支完成并归档，但本地 gitignored 的 state.json 仍停在该任务。');
      console.log('\n修复建议（需明确用户意图，不要用 agent step 机械修复）:');
      console.log('  - 若该任务已在别处完成/归档: docpath task abort 清理陈旧状态，回到 idle。');
      console.log('  - 若需在本 checkout 继续: 从 git/归档恢复 canonical 任务目录后再 docpath tasks sync。');
      console.log('  - 若这其实是新需求: capture/promote 新 backlog 绑定新 task_id，不要复用旧 id。');
      throw new Error(`phantom task drift detected: state.task_id=${current.task_id} has no current/canonical task dir`);
    }

    console.log('❌  检测到 tasks/current 与 canonical 任务目录漂移：');
    for (const drift of drifts) {
      console.log(`- ${drift.file}: ${drift.reason}`);
      console.log(`  current: ${drift.currentPath}`);
      console.log(`  canonical: ${drift.canonicalPath}`);
      if (drift.detail) {
        for (const line of drift.detail.split('\n')) {
          console.log(`  ${line}`);
        }
      }
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
