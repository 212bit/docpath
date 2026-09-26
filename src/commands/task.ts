/**
 * docpath task — 当前任务生命周期管理与上下文热切换。
 */

import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { writeBreadcrumb } from '../engine/breadcrumb.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { listBacklogItems, setBacklogStatus } from '../engine/backlog.js';
import {
  dropTaskStash,
  findMatchingStash,
  listTaskStashes,
  popTaskStash,
  stashTask,
  type TaskStashMetadata,
} from '../engine/task-stash.js';
import { repairActiveTask, type TaskRepairReport } from '../engine/task-repair.js';
import { startCommand } from './start.js';
import { resolveDocpathDir } from '../utils/file.js';
import { mutateCurrentState, readCurrentState, syncCurrentDocument, type CurrentState } from '../utils/workspace.js';
import {
  archivedTaskDir,
  canonicalTaskDir,
  clearCurrentTaskAlias,
  detectActiveTaskFileDrift,
  detectActiveTaskIdentityDrift,
  formatPhantomMissingFiles,
  formatTaskIdentityDrift,
  syncActiveTaskFiles,
} from '../utils/task-files.js';

export interface TaskCommandOptions {
  cwd: string;
  action?: string;
  target?: string;
  extra?: string;
  message?: string;
  withGit?: boolean;
  noGit?: boolean;
  all?: boolean;
  agent?: boolean;
  json?: boolean;
  dryRun?: boolean;
  from?: 'canonical' | 'current' | 'auto';
  auto?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function assertActiveTask(current: CurrentState | null, action: string): CurrentState {
  if (!current?.task_id || current.phase === 'idle' || current.phase === 'completed') {
    throw new Error(`docpath task ${action}: 当前没有可${action === 'abort' ? '废弃' : '重置'}的活跃任务`);
  }
  return current;
}

async function writeIdleState(cwd: string, previous: CurrentState, currentStep: string): Promise<void> {
  const ts = nowIso();
  await mutateCurrentState(cwd, (latest) => ({
    ...(latest ?? previous),
    state: 'idle',
    phase: 'idle',
    gate: 'none',
    workflow_profile: 'standard',
    task_id: '',
    task_title: '',
    current_step: currentStep,
    started_at: ts,
    updated_at: ts,
  }));
}

async function archiveCanonicalTask(docpathDir: string, taskId: string): Promise<string | null> {
  const source = canonicalTaskDir(docpathDir, taskId);
  const target = archivedTaskDir(docpathDir, taskId);
  if (!existsSync(source)) return null;

  await mkdir(join(docpathDir, 'tasks', 'done'), { recursive: true });
  if (existsSync(target)) return target;

  await rename(source, target);
  return target;
}

async function dropLinkedBacklog(cwd: string, taskId: string): Promise<string | null> {
  const linked = (await listBacklogItems(cwd)).find((item) => item.links.task === taskId);
  if (!linked || linked.status === 'dropped') return linked?.id ?? null;
  if (linked.status !== 'active') return null;

  await setBacklogStatus(cwd, linked.id, 'dropped');
  return linked.id;
}

async function taskAbort(options: TaskCommandOptions): Promise<void> {
  const current = assertActiveTask(await readCurrentState(options.cwd), 'abort');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const taskId = current.task_id;

  const droppedBacklogId = await dropLinkedBacklog(options.cwd, taskId);
  await writeBreadcrumb(options.cwd, {
    taskId,
    step: 'task.abort',
    status: 'done',
    context: `任务已废弃并回到 idle${droppedBacklogId ? `，backlog ${droppedBacklogId} -> dropped` : ''}`,
  });

  const archivedPath = await archiveCanonicalTask(docpathDir, taskId);
  await clearCurrentTaskAlias(docpathDir);
  await writeIdleState(options.cwd, current, `任务已废弃: ${taskId}`);

  console.log(`✅  当前任务已废弃: ${taskId}`);
  if (archivedPath) {
    console.log(`📦  任务已归档: ${archivedPath}`);
  } else {
    console.log('⚠️  canonical 任务目录不存在，仅清理 current 视图和状态');
  }
  if (droppedBacklogId) {
    console.log(`🔁  backlog 已回填为 dropped: ${droppedBacklogId}`);
  }
  console.log('📌  工作流已回到 idle');
}

async function taskReset(options: TaskCommandOptions): Promise<void> {
  const current = assertActiveTask(await readCurrentState(options.cwd), 'reset');
  const docpathDir = await resolveDocpathDir(options.cwd);
  const taskId = current.task_id;

  await writeBreadcrumb(options.cwd, {
    taskId,
    step: 'task.reset',
    status: 'done',
    context: '任务上下文已清空并回到 idle',
  });

  await clearCurrentTaskAlias(docpathDir);
  await writeIdleState(options.cwd, current, `任务上下文已重置: ${taskId}`);

  console.log(`✅  当前任务上下文已重置: ${taskId}`);
  console.log('📌  工作流已回到 idle');
}

/**
 * R-298: completed 任务的唯一合法重入路径。门禁事件（check/review）已禁入
 * completed，重开必须显式声明意图并记录 breadcrumb，之后重走完整闭环。
 */
async function taskReopen(options: TaskCommandOptions): Promise<void> {
  const current = await readCurrentState(options.cwd);
  if (!current?.task_id || current.phase !== 'completed') {
    throw new Error(
      `docpath task reopen: 仅 completed 任务可重开（当前 phase=${current?.phase || 'idle'}）。` +
      '活跃任务请直接继续；无任务请走 backlog promote / quick。',
    );
  }
  const next = await transitionWorkflow(options.cwd, 'task.reopened', {
    currentStep: `任务已重开: ${current.task_id}`,
  });
  await writeBreadcrumb(options.cwd, {
    taskId: current.task_id,
    step: 'task.reopened',
    status: 'done',
    context: '完成态任务经显式 reopen 回到 executing（R-298）',
  });
  console.log(`✅  已重开任务: ${current.task_id}（phase: ${next.phase}）`);
  console.log('📌  修复完成后请运行 `docpath done` 重新走收口门禁闭环');
}

/**
 * R-314: 原 `docpath tasks` 的 drift / sync 实现。
 */
export async function taskFileSyncCommand(options: {
  cwd: string;
  action: string;
  from?: 'canonical' | 'current' | 'auto';
  agent?: boolean;
  json?: boolean;
  auto?: boolean;
  dryRun?: boolean;
}): Promise<void> {
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
      console.log(`  ${formatPhantomMissingFiles(phantom)}`);
      console.log('  常见成因: 任务在另一分支完成并归档，但本地 gitignored 的 state.json 仍停在该任务。');
      console.log('\n修复建议（需明确用户意图，不要用 agent step 机械修复）:');
      console.log('  - 若该任务已在别处完成/归档: docpath task abort 清理陈旧状态，回到 idle。');
      console.log('  - 若需在本 checkout 继续: 从 git/归档恢复 canonical 任务目录后再 docpath task sync。');
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
    console.log('\n修复建议: docpath task repair（一键自愈修复）或 docpath task sync --from canonical');
    throw new Error(`tasks/current drift detected: ${drifts.map((drift) => drift.file).join(', ')}`);
  }

  if (action === 'repair' || (action === 'sync' && (options.from === 'auto' || (options as any).auto))) {
    const { stringify } = await import('yaml');
    const report = await repairActiveTask({
      cwd,
      dryRun: !!(options as any).dryRun,
    });

    if (options.agent) {
      console.log(stringify({
        agent_view: 'task_repair',
        task_id: report.task_id,
        healthy_before: report.healthy_before,
        healthy_after: report.healthy_after,
        repaired_count: report.repaired_count,
        actions: report.actions,
      }));
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`\n🩺  DocPath Task 自愈与修复: ${report.task_id}\n`);
    if (report.actions.length === 0) {
      console.log('✅  当前任务状态完全健康，无真源失配或文件漂移！');
      return;
    }

    console.log(`📋  自愈修复了 ${report.repaired_count} 项漂移:\n`);
    const catLabels: Record<string, string> = {
      markdown_hash_drift: '📝 [真源指纹失配]',
      file_mirror_drift: '🪞 [任务镜像漂移]',
      step_progress_drift: '⚡ [步骤进度漂移]',
      identity_drift: '🆔 [任务身份漂移]',
    };

    for (const act of report.actions) {
      const label = catLabels[act.category] || `[${act.category}]`;
      const icon = act.repaired ? '✅' : 'ℹ️';
      console.log(`  ${icon} ${label} ${act.file}`);
      console.log(`     ${act.detail}`);
    }

    console.log(`\n🎉  任务自愈完成，真源已恢复一致！\n`);
    return;
  }

  if (action === 'sync') {
    const from = options.from || 'canonical';
    if (!['canonical', 'current', 'auto'].includes(from)) {
      throw new Error('docpath task sync --from 仅支持 canonical、current 或 auto');
    }
    const synced = await syncActiveTaskFiles(docpathDir, current.task_id, from as 'canonical' | 'current');
    await syncCurrentDocument(cwd);
    console.log(`✅  已同步 active task 文件 (${from} -> ${from === 'canonical' ? 'current' : 'canonical'})`);
    for (const item of synced) {
      console.log(`- ${item.file}`);
      console.log(`  from: ${item.fromPath}`);
      console.log(`  to:   ${item.toPath}`);
    }
    return;
  }

  throw new Error(`Unsupported task action: ${action}. Expected drift | sync | repair`);
}

/**
 * 暂存当前活跃任务
 */
async function taskStashCommand(options: TaskCommandOptions, message?: string): Promise<void> {
  const withGit = options.noGit ? false : (options.withGit ?? true);
  const result = await stashTask(options.cwd, {
    message: message || options.message,
    withGit,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.agent) {
    const { stringify } = await import('yaml');
    console.log(stringify({
      status: 'stashed',
      stash_id: result.stash.id,
      task_id: result.stash.taskId,
      task_title: result.stash.taskTitle,
      phase: result.stash.phase,
      current_step: result.stash.currentStep,
      git_stashed: result.gitStashed,
      message: result.stash.message ?? null,
      next_action: '任务已暂存，工作流回到 idle。可运行 docpath start 拉起新任务，或 docpath task pop 恢复。',
      recommended_command: 'docpath task pop',
    }));
    return;
  }

  console.log(`📦  当前任务已暂存: ${result.stash.taskId} (${result.stash.taskTitle})`);
  console.log(`   stash_id: ${result.stash.id}`);
  console.log(`   phase:    ${result.stash.phase} (step: ${result.stash.currentStep})`);
  if (result.stash.message) {
    console.log(`   message:  ${result.stash.message}`);
  }
  if (result.gitStashed) {
    console.log(`   git:      已保存未提交变更 (stash ref: ${result.stash.gitStashMessage})`);
  } else {
    console.log('   git:      工作区无未提交变更（或已通过 --no-git 跳过）');
  }
  console.log('📌  工作流已回到 idle。随时运行 `docpath task pop` 恢复，或 `docpath start` 开启新任务。');
}

/**
 * 列出所有暂存任务
 */
async function taskStashListCommand(options: TaskCommandOptions): Promise<void> {
  const stashes = await listTaskStashes(options.cwd);

  if (options.json) {
    console.log(JSON.stringify({ stashes }, null, 2));
    return;
  }

  if (options.agent) {
    const { stringify } = await import('yaml');
    console.log(stringify({
      stashes: stashes.map((s) => ({
        id: s.id,
        task_id: s.taskId,
        task_title: s.taskTitle,
        phase: s.phase,
        current_step: s.currentStep,
        created_at: s.createdAt,
        git_stashed: !!s.gitStashed,
        message: s.message ?? null,
      })),
      count: stashes.length,
    }));
    return;
  }

  if (stashes.length === 0) {
    console.log('暂无暂存的任务。');
    return;
  }

  console.log(`=== 任务暂存列表 (共 ${stashes.length} 个) ===`);
  stashes.forEach((s, idx) => {
    const time = s.createdAt ? s.createdAt.slice(0, 19).replace('T', ' ') : '';
    const gitTag = s.gitStashed ? ' [git saved]' : '';
    console.log(`  [${idx + 1}] ${s.id}${gitTag}`);
    console.log(`      任务: ${s.taskId} — ${s.taskTitle}`);
    console.log(`      状态: ${s.phase} (${s.currentStep}) | 创建时间: ${time}`);
    if (s.message) {
      console.log(`      备注: ${s.message}`);
    }
  });
  console.log('\n💡 提示: 恢复任务请运行 `docpath task pop [id]` 或 `docpath task switch <task_id>`');
}

/**
 * 恢复暂存任务
 */
async function taskStashPopCommand(options: TaskCommandOptions, query?: string): Promise<void> {
  const withGit = options.noGit ? false : (options.withGit ?? true);
  const result = await popTaskStash(options.cwd, query, { withGit });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.agent) {
    const { stringify } = await import('yaml');
    console.log(stringify({
      status: 'restored',
      task_id: result.stash.taskId,
      task_title: result.stash.taskTitle,
      phase: result.stash.phase,
      current_step: result.stash.currentStep,
      git_popped: result.gitPopped,
      git_warning: result.gitWarning ?? null,
      next_action: `任务已恢复，请继续执行步骤 ${result.stash.currentStep}`,
      recommended_command: `docpath go --step ${result.stash.currentStep}`,
    }));
    return;
  }

  console.log(`✅  已恢复暂存任务: ${result.stash.taskId} (${result.stash.taskTitle})`);
  console.log(`   phase:    ${result.stash.phase} (step: ${result.stash.currentStep})`);
  if (result.gitPopped) {
    console.log('   git:      已恢复 Git 未提交变更');
  }
  if (result.gitWarning) {
    console.log(`   ${result.gitWarning}`);
  }
  console.log(`📌  任务上下文已恢复！可运行 \`docpath go --step ${result.stash.currentStep}\` 或 \`docpath next --agent\` 继续开发。`);
}

/**
 * 丢弃暂存记录
 */
async function taskStashDropCommand(options: TaskCommandOptions, query?: string): Promise<void> {
  const droppedIds = await dropTaskStash(options.cwd, query, { all: options.all });
  console.log(`🗑️  已丢弃暂存记录: ${droppedIds.join(', ')}`);
}

/**
 * 任务快速切换 (Auto-stash + Pop / Activate / Start)
 */
async function taskSwitchCommand(options: TaskCommandOptions, target?: string): Promise<void> {
  const targetId = target?.trim();
  if (!targetId) {
    throw new Error('docpath task switch 需要提供目标 Task ID、Backlog ID 或 Stash ID，例如: docpath task switch R-101 或 docpath task switch T-20260925-feature');
  }

  const current = await readCurrentState(options.cwd);
  const withGit = options.noGit ? false : (options.withGit ?? true);

  // 1. 如果当前已有活跃任务且与目标不一致，先自动暂存
  if (current?.task_id && current.phase !== 'idle' && current.phase !== 'completed' && current.task_id !== targetId) {
    const stashRes = await stashTask(options.cwd, {
      message: options.message || `Auto-stashed before switching to ${targetId}`,
      withGit,
    });
    console.log(`📦  已自动暂存前序任务: ${stashRes.stash.taskId} (${stashRes.stash.id})`);
  }

  // 2. 检查目标是否在暂存区中
  const stashes = await listTaskStashes(options.cwd);
  const matchedStash = findMatchingStash(stashes, targetId);
  if (matchedStash) {
    await taskStashPopCommand(options, matchedStash.id);
    return;
  }

  // 3. 检查目标是否为已有 canonical 任务目录
  const docpathDir = await resolveDocpathDir(options.cwd);
  const canonicalDir = canonicalTaskDir(docpathDir, targetId);
  if (existsSync(canonicalDir)) {
    const candidates: ('spec.md' | 'plan.md')[] = ['spec.md', 'plan.md'];
    const existing = candidates.filter((f) => existsSync(join(canonicalDir, f)));
    if (existing.length > 0) {
      await syncActiveTaskFiles(docpathDir, targetId, 'canonical', existing);
    }
    await syncCurrentDocument(options.cwd);
    await mutateCurrentState(options.cwd, (prev) => ({
      level: prev?.level || 2,
      workflow_profile: prev?.workflow_profile || 'standard',
      state: 'executing',
      task_id: targetId,
      task_title: prev?.task_title || targetId,
      phase: 'executing',
      current_step: 'S1',
      gate: 'none',
      started_at: prev?.started_at || nowIso(),
      updated_at: nowIso(),
    }));
    await writeBreadcrumb(options.cwd, {
      taskId: targetId,
      step: 'task.switch',
      status: 'done',
      context: `已切换至已有任务目录: ${targetId}`,
    });
    console.log(`✅  已切换至任务目录: ${targetId}`);
    console.log('📌  任务已激活为 executing 状态，可运行 `docpath next --agent` 或 `docpath go`');
    return;
  }

  // 4. 检查是否为 Backlog ID 或新任务标题
  console.log(`🚀  目标 ${targetId} 未在暂存区或本地已有任务中，尝试通过 docpath start 拉起...`);
  await startCommand({
    cwd: options.cwd,
    id: targetId,
    draft: true,
    adopt: true,
    agent: options.agent,
  });
}

export async function taskCommand(options: TaskCommandOptions): Promise<void> {
  const action = options.action?.trim().toLowerCase();
  switch (action) {
    case 'abort':
      await taskAbort(options);
      return;
    case 'reset':
      await taskReset(options);
      return;
    case 'reopen':
      await taskReopen(options);
      return;
    case 'stash': {
      const sub = options.target?.trim().toLowerCase();
      if (sub === 'list' || sub === 'ls') {
        await taskStashListCommand(options);
        return;
      }
      if (sub === 'pop') {
        await taskStashPopCommand(options, options.extra);
        return;
      }
      if (sub === 'drop') {
        await taskStashDropCommand(options, options.extra);
        return;
      }
      if (sub === 'clear') {
        await taskStashDropCommand({ ...options, all: true });
        return;
      }
      // 否则将 target 作为 stash message
      await taskStashCommand(options, options.target);
      return;
    }
    case 'pop':
      await taskStashPopCommand(options, options.target);
      return;
    case 'drop':
      await taskStashDropCommand(options, options.target);
      return;
    case 'list':
      await taskStashListCommand(options);
      return;
    case 'drift':
    case 'sync':
    case 'repair':
      await taskFileSyncCommand({
        cwd: options.cwd,
        action: action as any,
        from: options.from,
        ...(options as any),
      });
      return;
    case 'switch':
      await taskSwitchCommand(options, options.target);
      return;
    default:
      throw new Error(`docpath task: unsupported action ${action || '(empty)'}（允许: abort|reset|reopen|drift|sync|repair|stash|pop|switch|drop|list）`);
  }
}
