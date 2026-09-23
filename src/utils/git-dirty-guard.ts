import { execFileSync } from 'node:child_process';
import pc from 'picocolors';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitSync } from './git-run.js';


export interface DirtyWorktreeReport {
  isGitRepo: boolean;
  repoRoot: string | null;
  dirty: boolean;
  files: string[];
  untrackedFiles: string[];
  docpathFiles: string[];
  nonDocPathFiles: string[];
  staged: number;
  unstaged: number;
  untracked: number;
}

interface ParsedStatusLine {
  file: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface CleanWorktreeOptions {
  allowDirtyPath?: (path: string) => boolean;
}

interface ExecutionStartDirtyOptions {
  taskId?: string;
  backlogId?: string | null;
  step?: string;
}

function runGit(cwd: string, args: string[]): string {
  return gitSync(cwd, args);
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '');
}

function parseStatusLine(line: string): ParsedStatusLine | null {
  if (line.length < 4) return null;
  const x = line[0];
  const y = line[1];
  const rawFile = line.slice(3).trim();
  if (!rawFile) return null;

  return {
    file: normalizeGitPath(rawFile.includes(' -> ') ? rawFile.split(' -> ').at(-1) || rawFile : rawFile),
    staged: x !== ' ' && x !== '?' && x !== '!',
    unstaged: y !== ' ' && y !== '?' && y !== '!',
    untracked: x === '?' && y === '?',
  };
}

function isDocPathManagedPath(path: string): boolean {
  const file = normalizeGitPath(path);
  return file === '.docpath' || file.startsWith('.docpath/');
}

/**
 * DocPath 簿记路径（R-313）：backlog 记账（capture/add/edit/accept/drop 与
 * 索引重生成）是 DocPath 命令自己产出的状态，与 docs-index 同类（R-270 先例）。
 * dirty guard 的使命是防任务代码混入，不拦簿记——否则每次 backlog 操作后
 * 开新任务都要先手动 chore(backlog) 收口（SynapBuddy 与本仓库双重实测摩擦）。
 * changes --agent 的 outside-task 可见性不受影响，簿记随下次收口提交。
 */
function isDocPathBookkeepingPath(path: string): boolean {
  const file = normalizeGitPath(path);
  return file === '.docpath/backlog' || file.startsWith('.docpath/backlog/');
}

function previewFiles(files: string[]): string[] {
  const preview = files.slice(0, 12);
  if (files.length > preview.length) preview.push(`... ${files.length - preview.length} more`);
  return preview;
}

function formatDirtySummary(report: DirtyWorktreeReport, files: string[]): string {
  const lines = [
    `   changed_files: ${files.length}`,
    `   staged: ${report.staged}`,
    `   unstaged: ${report.unstaged}`,
    `   untracked: ${report.untracked}`,
    '   files:',
    ...previewFiles(files).map((file) => `     - ${file}`),
  ];
  return lines.join('\n');
}

function isCurrentTaskExecutionPath(path: string, options: ExecutionStartDirtyOptions): boolean {
  const file = normalizeGitPath(path);
  const taskId = options.taskId?.trim();

  if (file.startsWith('.docpath/workspace/')) return true;
  if (file.startsWith('.docpath/tasks/current/')) return true;
  if (taskId && file.startsWith(`.docpath/tasks/${taskId}/`)) return true;
  // R-313: backlog 全域为簿记路径，不再限于绑定条目
  if (isDocPathBookkeepingPath(file)) return true;
  // DocPath self-maintained index artifacts refreshed by check (R-270):
  // auto docs-index refresh must not block go/agent enter on the same task.
  // R-336: docs.md 已下线不再生成，白名单仅剩 docs-index.json。
  if (file === '.docpath/docs-index.json') return true;
  return false;
}

function buildDirtyWorktreeError(
  command: string,
  report: DirtyWorktreeReport,
  files: string[],
  mode: 'new-task' | 'execution-start',
  options: ExecutionStartDirtyOptions = {},
): Error {
  const reason = mode === 'new-task'
    ? '当前 Git worktree 存在未提交变更，拒绝在 dirty worktree 上启动新任务。'
    : '当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更，拒绝进入执行步骤。';
  const lines = [
    `${command}: ${reason}`,
    formatDirtySummary(report, files),
  ];

  if (mode === 'new-task' && command.includes('quick')) {
    lines.push(
      '   若这些未提交变动属于即将登记的微型任务，请使用事后补录认领现有改动:',
      '     docpath quick "<title>" --adopt',
    );
  }

  if (mode === 'execution-start') {
    const step = options.step?.trim() || '<step>';
    lines.push(
      '   正常启动步骤:',
      `     docpath go --step ${step}`,
    );
    // R-330: run start 只解锁 phase 门（planning→executing），对 untracked 新文件无效。
    // 恢复指引必须按阻塞文件构成分支，否则 agent 照建议执行后仍会弹回。
    const untrackedSet = new Set(report.untrackedFiles);
    const blockedUntracked = files.filter((file) => untrackedSet.has(file));
    if (blockedUntracked.length > 0) {
      lines.push(
        '   未跟踪新文件 = 尚未被 git 认领归属。门禁无法判断它属于哪个任务，故拒绝进入。',
        '   若确属本任务，逐一 git add 认领（不要 git add -A：worktree 常有别的 agent 在改，',
        '   半成品会被扫进同一 commit 难以回滚）后重试:',
        ...blockedUntracked.slice(0, 5).map((file) => `     git add ${file}`),
      );
      if (blockedUntracked.length > 5) {
        lines.push(`     （其余 ${blockedUntracked.length - 5} 个未跟踪文件同理）`);
      }
    }
    if (blockedUntracked.length < files.length) {
      lines.push(
        '   如果这些已跟踪源码/测试改动已确认属于当前任务，用恢复入口记录意图:',
        `     docpath go --step ${step} --accept-dirty "recover current-task edits before go"`,
        `     或 docpath run start --step ${step} --note "recover current-task edits before go"`,
      );
    } else {
      lines.push(
        '   全部为未跟踪文件时也可用首等恢复旗标:',
        `     docpath go --step ${step} --accept-dirty "recover current-task edits before go"`,
      );
    }
  }

  lines.push(
    '   先收口当前变更:',
    '     docpath changes --agent',
    '   并行开发请创建隔离 worktree:',
    '     docpath worktree create <slug>',
  );
  return new Error(lines.join('\n'));
}

export function detectDirtyWorktree(cwd: string): DirtyWorktreeReport {
  let repoRoot: string;
  try {
    repoRoot = runGit(cwd, ['rev-parse', '--show-toplevel']).trim();
  } catch {
    return {
      isGitRepo: false,
      repoRoot: null,
      dirty: false,
      files: [],
      untrackedFiles: [],
      docpathFiles: [],
      nonDocPathFiles: [],
      staged: 0,
      unstaged: 0,
      untracked: 0,
    };
  }

  const parsed = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all'])
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map(parseStatusLine)
    .filter((line): line is ParsedStatusLine => line !== null);
  const files = Array.from(new Set(parsed.map((line) => line.file))).sort();
  const untrackedFiles = Array.from(new Set(parsed.filter((line) => line.untracked).map((line) => line.file))).sort();
  const docpathFiles = files.filter(isDocPathManagedPath);
  const nonDocPathFiles = files.filter((file) => !isDocPathManagedPath(file));

  return {
    isGitRepo: true,
    repoRoot,
    dirty: files.length > 0,
    files,
    untrackedFiles,
    docpathFiles,
    nonDocPathFiles,
    staged: parsed.filter((line) => line.staged).length,
    unstaged: parsed.filter((line) => line.unstaged).length,
    untracked: parsed.filter((line) => line.untracked).length,
  };
}

export function assertCleanWorktreeForNewTask(cwd: string, command: string, options: CleanWorktreeOptions = {}): void {
  const report = detectDirtyWorktree(cwd);
  if (!report.isGitRepo || !report.dirty) return;
  const blockedFiles = report.files
    .filter((file) => !isDocPathBookkeepingPath(file))
    .filter((file) => !options.allowDirtyPath?.(file));
  if (blockedFiles.length === 0) return;
  throw buildDirtyWorktreeError(command, report, blockedFiles, 'new-task');
}

/**
 * Linked worktree marker: `.git` is a *file* (gitdir pointer), not a directory.
 * R-288: 判定必须与共享契约无关——旧实现依赖 backlog/rules 为 symlink，
 * R-273 改为 tracked copy 后永远 false，worktree 放宽分支成死逻辑。
 * R-289: 全仓库唯一 worktree 判定实现，changes-report 等消费方一律复用此导出。
 */
export function isLinkedGitWorktree(gitRoot: string): boolean {
  try {
    return lstatSync(join(gitRoot, '.git')).isFile();
  } catch {
    return false;
  }
}

// R-288: check/review 失败后回补代码时 phase 处于 checking/reviewing，
// 仍属于同一任务的活跃执行期，不应重新拦截本任务自己的 tracked 改动。
const ACTIVE_TASK_PHASES = new Set(['executing', 'checking', 'reviewing']);

export function assertNoNonDocPathChangesForExecutionStart(
  cwd: string,
  command: string,
  options: ExecutionStartDirtyOptions = {},
): void {
  const report = detectDirtyWorktree(cwd);
  if (!report.isGitRepo || !report.dirty) return;

  let isActiveTask = false;
  try {
    const docpathDir = join(report.repoRoot || cwd, '.docpath');
    const statePath = join(docpathDir, 'workspace', 'state.json');
    if (existsSync(statePath)) {
      const state = JSON.parse(readFileSync(statePath, 'utf-8'));
      if (state && state.task_id && options.taskId && state.task_id === options.taskId && ACTIVE_TASK_PHASES.has(state.phase)) {
        isActiveTask = true;
      }
    }
  } catch {
    // ignore
  }

  const inWorktree = report.repoRoot ? isLinkedGitWorktree(report.repoRoot) : false;
  const untrackedSet = new Set(report.untrackedFiles);

  const blockedFiles = report.files.filter((file) => {
    if (isCurrentTaskExecutionPath(file, options)) return false;

    if (isActiveTask) {
      if (inWorktree) return false;
      if (!untrackedSet.has(file)) return false;
    }

    return true;
  });

  if (blockedFiles.length === 0) return;
  throw buildDirtyWorktreeError(command, report, blockedFiles, 'execution-start', options);
}

export function detectUncommittedNonDocPathFiles(cwd: string): { nonDocPathFiles: string[]; count: number } {
  const report = detectDirtyWorktree(cwd);
  if (!report.isGitRepo) {
    return { nonDocPathFiles: [], count: 0 };
  }
  return {
    nonDocPathFiles: report.nonDocPathFiles,
    count: report.nonDocPathFiles.length,
  };
}

export function renderCommitReminder(nonDocPathFiles: string[]): string {
  if (!nonDocPathFiles || nonDocPathFiles.length === 0) {
    return '';
  }
  const fileList = nonDocPathFiles.map((file) => `  - ${file}`).join('\n');
  return [
    pc.yellow('⚠️  警告: 存在未提交的业务代码/测试文件变动'),
    pc.gray('未提交文件:'),
    fileList,
    pc.gray('建议使用以下命令提交关联改动:'),
    `  docpath changes --agent && git commit`,
    pc.yellow('免责声明: 这些文件可能混合了多个任务/Agent 的改动，请在 commit 前务必确认文件归属。'),
  ].join('\n');
}


