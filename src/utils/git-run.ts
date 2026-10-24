import { RunToolError, runTool, runToolSyncOrThrow } from './run-tool.js';

export const DEFAULT_GIT_TIMEOUT_MS = 10_000;
export const DEFAULT_GIT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * R-337 A1: 全仓共享 git 执行原语。
 *
 * 背景：12+ 文件各自 execFileSync('git')，quotePath 修复（R-335 FR-7）只覆盖
 * 4 处，其余调用点对 CJK 路径仍会拿到八进制 C-quoting 字符串（backlog/rules
 * 的中文文件名是常态）。本模块是唯一出口：quotePath 全局关闭 + 统一超时与 buffer。
 *
 * 进程启动交给 run-tool（强制超时、stdin 不继承）。各调用方保留自己的 trim/异常语义，
 * 本模块只返回原始 stdout；非零退出、超时、环境失败都抛错。
 */

const GIT_QUOTE_ARGS = ['-c', 'core.quotePath=false'];

export interface GitRunOptions {
  timeoutMs?: number;
  maxBuffer?: number;
}

function gitOptions(cwd: string, opts: GitRunOptions) {
  return {
    cwd,
    timeoutMs: opts.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    maxBuffer: opts.maxBuffer ?? DEFAULT_GIT_MAX_BUFFER,
    stdin: 'ignore' as const,
    stdout: 'pipe' as const,
    stderr: 'pipe' as const,
    offline: false as const,
  };
}

/** 同步执行 git，返回原始 stdout（不 trim）；非零退出/失败抛错。 */
export function gitSync(cwd: string, args: string[], opts: GitRunOptions = {}): string {
  return runToolSyncOrThrow('git', [...GIT_QUOTE_ARGS, ...args], gitOptions(cwd, opts));
}

/** 同步执行 git；任何失败返回 null（调用方自行兜底）。 */
export function gitSyncOptional(cwd: string, args: string[], opts: GitRunOptions = {}): string | null {
  try {
    return gitSync(cwd, args, opts);
  } catch {
    return null;
  }
}

/** 异步执行 git，返回原始 stdout（不 trim）；非零退出/失败抛错。 */
export async function gitAsync(cwd: string, args: string[], opts: GitRunOptions = {}): Promise<string> {
  const result = await runTool('git', [...GIT_QUOTE_ARGS, ...args], gitOptions(cwd, opts));
  if (result.status !== 'ok') throw new RunToolError(result);
  return result.stdout;
}

/** 异步执行 git；任何失败返回 null。 */
export async function gitAsyncOptional(cwd: string, args: string[], opts: GitRunOptions = {}): Promise<string | null> {
  try {
    return await gitAsync(cwd, args, opts);
  } catch {
    return null;
  }
}
