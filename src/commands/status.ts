/**
 * docpath:status — 查看当前工作流状态
 */

import { join } from 'node:path';
import { generateAgentOutput } from '../utils/agent-output.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { handleStalePendingDoneWarning, readPendingDone } from '../utils/pending-done.js';
import { readCurrentState, type CurrentState } from '../utils/workspace.js';

interface StatusOptions {
  cwd: string;
  agent?: boolean;
}

const LEVEL_NAMES: Record<string, string> = {
  '0': '即时响应',
  '1': '轻量任务',
  '2': '标准任务',
  '3': '复杂任务',
};

function printMissingStateHint(): void {
  console.log('\n⚠️  未找到可解析的工作流状态');
  console.log('  请先运行 `docpath init` 初始化工作流，或检查 .docpath/workspace/state.json 是否存在');
  console.log('  其中 current.md 只是由 state.json 重建的渲染产物，二者应保持同步\n');
}

function printStateSummary(current: CurrentState, currentPath: string): void {
  const level = String(current.level ?? '?');
  const state = current.state || '?';
  const task = current.task_title || '(无活跃任务)';
  const phase = current.phase || '?';
  const gate = current.gate || 'none';

  console.log(`  级别:  Level ${level} — ${LEVEL_NAMES[level] || '未知'}`);
  console.log(`  状态:  ${state}`);
  console.log(`  阶段:  ${phase}`);
  console.log(`  门禁:  ${gate}`);
  console.log(`  任务:  ${task}`);
  console.log(`  状态真源:  .docpath/workspace/state.json`);
  console.log(`  渲染产物:  ${currentPath}`);
}

async function printPendingDoneWarning(cwd: string, current: CurrentState): Promise<void> {
  const pendingDone = await handleStalePendingDoneWarning(cwd, current, await readPendingDone(cwd));
  if (
    current.phase === 'executing' &&
    pendingDone &&
    pendingDone.task_id === current.task_id
  ) {
    console.log('\n  ⚠️  检测到当前任务存在未收尾哨兵');
    console.log(`     task_id: ${pendingDone.task_id}`);
    console.log(`     entered_at: ${pendingDone.entered_at}`);
    console.log('     建议先运行: docpath agent done');
  }
}

async function printBreadcrumbProgress(breadcrumbPath: string): Promise<void> {
  const breadcrumb = await readFileSafe(breadcrumbPath);
  if (breadcrumb && breadcrumb.includes('## 当前会话')) {
    const phaseMatch = breadcrumb.match(/当前 Phase:\s*(\w+)/);
    const subTaskMatch = breadcrumb.match(/当前子任务:\s*(.+)/);
    if (phaseMatch || subTaskMatch) {
      console.log(`\n  🍞  执行进度:`);
      if (phaseMatch) console.log(`     Phase: ${phaseMatch[1]}`);
      if (subTaskMatch) console.log(`     子任务: ${subTaskMatch[1]}`);
    }
  }
}

function printPhaseHint(phase: string): void {
  if (phase === 'completed') {
    console.log('\n  ✅  当前任务已完成，适合启动新 backlog 或归档知识。');
  } else if (phase === 'drafting') {
    console.log('\n  ℹ️  当前处于起草阶段，完成后应进入 plan / go。');
  } else if (phase === 'planning') {
    console.log('\n  ℹ️  当前处于计划阶段，完成后应进入 go。');
  } else if (phase === 'executing') {
    console.log('\n  ℹ️  当前处于执行阶段，请继续推进当前子任务。');
  }
}

async function printLinkedProject(cwd: string): Promise<void> {
  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const infoRaw = await readFileSafe(join(docpathDir, 'docpath.json'));
    if (infoRaw) {
      const info = JSON.parse(infoRaw);
      if (info.linkedTo) {
        const target = join(cwd, info.linkedTo);
        console.log(`  🔗  已关联: ${info.linkedTo} (${target})`);
      }
    }
  } catch {
    // 无关联项目或关联信息不可读时忽略。
  }
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const cwd = options.cwd;
  if (options.agent) {
    console.log(await generateAgentOutput(cwd));
    return;
  }

  const currentPath = join(cwd, '.docpath/workspace/current.md');
  const breadcrumbPath = join(cwd, '.docpath/workspace/breadcrumb.md');

  const current = await readCurrentState(cwd);
  if (!current) {
    printMissingStateHint();
    return;
  }

  console.log('\n📊  DocPath 工作流状态\n');

  printStateSummary(current, currentPath);
  await printPendingDoneWarning(cwd, current);
  await printBreadcrumbProgress(breadcrumbPath);
  printPhaseHint(current.phase);
  await printLinkedProject(cwd);

  console.log('');
}
