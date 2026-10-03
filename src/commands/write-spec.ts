/**
 * docpath:write-spec — 写入 spec.md
 *
 * 接受 spec 内容（通过参数或 stdin），写入 .docpath/tasks/current/spec.md，
 * 并更新状态为 brainstorming → planning。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { nextCommand, runPostWriteSteps } from './runtime.js';
import { validateSpecContent } from '../utils/doc-parser.js';
import { readActiveTaskFile, writeActiveTaskFile } from '../utils/task-files.js';
import { mutateCurrentState, readCurrentState } from '../utils/workspace.js';
import { canonicalTaskDir, currentTaskDir } from '../utils/task-files.js';
import { assertCleanWorktreeForNewTask } from '../utils/git-dirty-guard.js';
import { readStdin } from '../utils/stdin.js';
import { backlogIdFromMarkdown, taskIdFromMarkdown } from '../utils/structured-docs.js';
import { writeBreadcrumb } from '../utils/breadcrumb.js';

/**
 * write-spec 的硬性结构契约（与 doc-parser.validateSpecContent 一一对应）。
 * 该骨架同时用于 `--help` 的 Examples 段与校验失败时的提示输出，
 * 保证帮助文本、失败提示、校验规则三者同源，不各自漂移。
 */
export const MINIMAL_SPEC_SKELETON = [
  '# T-20260101-my-task - 任务标题',
  '',
  '## 1. 背景与动机',
  '- 为什么要做这件事',
  '',
  '## 2. 需求清单',
  '',
  '### 功能需求',
  '- [ ] FR-1: 功能要点（必须用 `- [ ] ` checkbox 形式）',
  '',
  '### 非功能需求',
  '- [ ] NFR-1: 非功能要点',
  '',
  '## 4.1 重大变更门禁',
  '',
  '### Decision Brief',
  '- 当前问题: 待决策的问题',
  '- 推荐方案: 选中的方案',
  '- 决策理由: 为什么选它',
  '- 用户确认: 已确认',
  '',
  '## 5. 验收标准',
  '- [ ] AC-1: 验收要点（必须用 `- [ ] ` checkbox 形式）',
  '',
].join('\n');

/** 结构契约要点清单，供 --help 与失败提示复用。 */
export const SPEC_CONTRACT_RULES = [
  '必须有 `# 任务标题`（一级标题，缺则判定无标题）',
  '首行 task_id 须为真实 `# T-<date>-<slug> - 标题` 或 `# R-<id>` 形式（不含尖括号，骨架示例可直接用）',
  '必须有 `### 功能需求` 章节，且至少一条 `- [ ] FR-N:`',
  '必须有 `## 5. 验收标准` 章节，且至少一条 `- [ ] AC-N:`',
  'FR-* / AC-* 必须是 `- [ ] ` checkbox 形式，裸 `- FR-1:` 不识别',
  '决策简报须置于 `## 4.1 重大变更门禁` 下的 `### Decision Brief`',
];

interface WriteSpecOptions {
  cwd: string;
  /** spec 内容（YAML/Markdown） */
  content?: string;
  /** 从 stdin 读取 */
  stdin?: boolean;
  /** 强制覆盖执行中任务的 spec */
  force?: boolean;
}

interface SpecTaskIdentity {
  taskId: string;
  taskTitle: string;
  backlogId?: string;
}

async function assertDocpathWorkspace(cwd: string): Promise<string> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }
  return docpathDir;
}

async function readSpecContent(options: WriteSpecOptions): Promise<string> {
  let specContent = options.content || '';

  if (!specContent && options.stdin !== false) {
    specContent = await readStdin();
  }

  if (!specContent.trim()) {
    console.error('❌  未提供 spec 内容。用法：');
    console.error('   docpath write-spec --content "..."');
    console.error('   echo "..." | docpath write-spec --stdin');
    process.exit(1);
  }

  return specContent;
}

async function validateSpecOrExit(cwd: string, docpathDir: string, specContent: string): Promise<void> {
  const validation = validateSpecContent(specContent);
  if (validation.ok) return;

  const current = await readCurrentState(cwd);
  const taskId = current?.task_id || taskIdFromMarkdown(specContent) || 'current';
  const canonicalPath = join(canonicalTaskDir(docpathDir, taskId), 'spec.md');
  const currentPath = join(currentTaskDir(docpathDir), 'spec.md');
  console.error('❌  spec.md 结构校验失败：');
  console.error(`   实际目标: ${canonicalPath}`);
  console.error(`   current 视图: ${currentPath}`);
  for (const issue of validation.issues) {
    console.error(`   - ${formatValidationIssue(issue)}`);
  }
  printSpecContractHint();
  process.exit(1);
}

/**
 * 校验失败时把结构契约与最小骨架一并打印出来。
 * 目的：让调用方（尤其是 Agent）在同一次调用里就能拿到可复制的修正模板，
 * 不必靠「写失败 → 猜格式 → 再写」反复试错（R-448）。
 */
function printSpecContractHint(): void {
  console.error('');
  console.error('   结构契约（缺任一即校验失败）:');
  for (const rule of SPEC_CONTRACT_RULES) {
    console.error(`     · ${rule}`);
  }
  console.error('');
  console.error('   最小可过校验骨架（复制后按需填充即可）:');
  for (const line of MINIMAL_SPEC_SKELETON.split('\n')) {
    console.error(`   ${line}`);
  }
}

function titleFromSpecHeading(specContent: string): string {
  const matchWithId = specContent.match(/^#\s+(?:(?:T|R)-[\w-]+\s*[-—:]\s*)(.+)$/m);
  if (matchWithId) return matchWithId[1].trim();
  const matchPlain = specContent.match(/^#\s+(.+)$/m);
  return matchPlain ? matchPlain[1].trim() : '';
}

function resolveSpecTaskIdentity(
  current: Awaited<ReturnType<typeof readCurrentState>>,
  specContent: string,
): SpecTaskIdentity {
  const declaredTaskId = taskIdFromMarkdown(specContent);
  const activeStateTaskId = current && !['idle', 'completed'].includes(current.phase)
    ? current.task_id?.trim()
    : '';
  const taskId = activeStateTaskId || declaredTaskId || '';
  if (!taskId) {
    console.error('❌  无法从 spec 首行解析 task_id。请使用 `# T-<date>-<slug> - <title>` 作为标题。');
    process.exit(1);
  }

  const rawBacklogId = backlogIdFromMarkdown(specContent);
  const backlogId = rawBacklogId || current?.backlog_id || undefined;

  return {
    taskId,
    taskTitle: activeStateTaskId ? current?.task_title?.trim() || titleFromSpecHeading(specContent) : titleFromSpecHeading(specContent),
    backlogId,
  };
}

function shouldRequireCleanWorktreeForSpecWrite(current: Awaited<ReturnType<typeof readCurrentState>>): boolean {
  return !current || current.phase === 'idle' || current.phase === 'completed';
}

function isSameActiveTaskSpecResync(
  current: Awaited<ReturnType<typeof readCurrentState>>,
  specContent: string,
): boolean {
  if (!current || ['idle', 'completed'].includes(current.phase)) return false;
  const declaredTaskId = taskIdFromMarkdown(specContent);
  if (declaredTaskId && declaredTaskId === current.task_id?.trim()) return true;
  return !declaredTaskId;
}

export async function writeSpecCommand(options: WriteSpecOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await assertDocpathWorkspace(cwd);
  const specContent = await readSpecContent(options);
  await validateSpecOrExit(cwd, docpathDir, specContent);

  const current = await readCurrentState(cwd);
  const { taskId, taskTitle, backlogId } = resolveSpecTaskIdentity(current, specContent);

  if (shouldRequireCleanWorktreeForSpecWrite(current)) {
    assertCleanWorktreeForNewTask(cwd, 'docpath write-spec');
  }

  let prevSpecContent: string | null = null;
  try {
    prevSpecContent = await readActiveTaskFile(docpathDir, taskId, 'spec.md');
  } catch {
    try {
      prevSpecContent = await readActiveTaskFile(docpathDir, undefined, 'spec.md');
    } catch {
      prevSpecContent = null;
    }
  }

  const isRealSpec = (content: string) => {
    const frCount = (content.match(/^\s*-\s*\[[ xX]\]\s*FR-\d+\s*:/gm) || []).length;
    const acCount = (content.match(/^\s*-\s*\[[ xX]\]\s*AC-\d+\s*:/gm) || []).length;
    return frCount > 0 || acCount > 0 || content.trim().split('\n').length > 5;
  };

  const hasPlan = Boolean(
    existsSync(join(canonicalTaskDir(docpathDir, taskId), 'plan.md')) ||
    existsSync(join(currentTaskDir(docpathDir), 'plan.md'))
  );

  const isExecutingWithPlan = Boolean(
    current &&
    current.phase === 'executing' &&
    current.workflow_profile !== 'quick' &&
    hasPlan
  );

  const isOverwriteDiff = Boolean(
    prevSpecContent &&
    isRealSpec(prevSpecContent) &&
    prevSpecContent.trim() !== specContent.trim()
  );

  let prevLines = 0;
  let newLines = 0;
  let lineDelta = 0;
  let prevFR = 0;
  let newFR = 0;
  let prevAC = 0;
  let newAC = 0;

  if (isOverwriteDiff && prevSpecContent) {
    prevLines = prevSpecContent.trim().split('\n').length;
    newLines = specContent.trim().split('\n').length;
    lineDelta = newLines - prevLines;
    prevFR = (prevSpecContent.match(/^\s*-\s*\[[ xX]\]\s*FR-\d+\s*:/gm) || []).length;
    newFR = (specContent.match(/^\s*-\s*\[[ xX]\]\s*FR-\d+\s*:/gm) || []).length;
    prevAC = (prevSpecContent.match(/^\s*-\s*\[[ xX]\]\s*AC-\d+\s*:/gm) || []).length;
    newAC = (specContent.match(/^\s*-\s*\[[ xX]\]\s*AC-\d+\s*:/gm) || []).length;

    if (isExecutingWithPlan && !options.force) {
      console.error('❌  spec.md 覆盖写入被拦截：当前任务已处于 executing 阶段。');
      console.error('   覆盖写入可能导致已有 plan.md 执行计划与 spec 脱节产生隐式漂移。');
      console.error('   若确认更新，请追加 --force 参数: docpath write-spec --stdin --force');
      console.error('');
      console.error('   变更概览:');
      console.error(`   · 行数: ${prevLines} -> ${newLines} (${lineDelta >= 0 ? '+' : ''}${lineDelta} 行)`);
      console.error(`   · FR 功能需求: ${prevFR} -> ${newFR} 项`);
      console.error(`   · AC 验收标准: ${prevAC} -> ${newAC} 项`);
      process.exit(1);
    }
  }

  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'spec.md', specContent);

  console.log(`✅  spec.md 已写入: ${canonicalPath}`);

  if (isOverwriteDiff) {
    if (isExecutingWithPlan && options.force) {
      console.log('⚠️  spec.md 覆盖写入（强制模式 --force）: 任务处于 executing 阶段，请检查 plan.md 是否需要通过 docpath plan 重新生成或对齐。');
    }
    console.log('ℹ️  spec.md 覆盖变更概览:');
    console.log(`   · 行数变动: ${prevLines} -> ${newLines} (${lineDelta >= 0 ? '+' : ''}${lineDelta} 行)`);
    console.log(`   · FR 功能需求: ${prevFR} -> ${newFR} 项`);
    console.log(`   · AC 验收标准: ${prevAC} -> ${newAC} 项`);

    try {
      await writeBreadcrumb(cwd, {
        taskId,
        step: 'spec.updated',
        status: 'done',
        context: `write-spec 覆盖更新: 行数 ${lineDelta >= 0 ? '+' : ''}${lineDelta}, FR ${prevFR}->${newFR}, AC ${prevAC}->${newAC}`,
      });
    } catch {
      // ignore breadcrumb write failure
    }
  }

  if (isSameActiveTaskSpecResync(current, specContent)) {
    if (backlogId && current && current.backlog_id !== backlogId) {
      await mutateCurrentState(cwd, (prev) => {
        const base = prev ?? current;
        return { ...base, backlog_id: backlogId };
      });
    }
    await nextCommand({ cwd });
    return;
  }

  // 更新状态为 drafting → planning（brainstorm 完成）。
  // 文件已写入即命令成功，后续状态转换/next 失败不抛出，避免误导退出码（R-248）。
  await runPostWriteSteps(cwd, 'task.created', {
    taskId,
    taskTitle,
    backlogId,
    currentStep: 'spec 已写入，下一步: docpath plan',
  });
}

function formatValidationIssue(issue: { message: string; line?: number; section?: string; field?: string }): string {
  const details = [
    issue.line ? `line ${issue.line}` : '',
    issue.section ? `section ${issue.section}` : '',
    issue.field ? `field ${issue.field}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${issue.message} (${details.join(', ')})` : issue.message;
}

/**
 * 从 stdin 读取全部内容
 */
