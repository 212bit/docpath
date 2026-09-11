/**
 * Type definitions for check command
 */

/** R-334: 共享窄 union —— 写侧直接赋值安全，读侧用 parse 校验器收窄 */
export const CHECK_CATEGORIES = ['compile', 'test', 'lint', 'plan', 'analysis', 'context', 'preflight', 'boundary', 'pattern'] as const;
export type CheckCategory = (typeof CHECK_CATEGORIES)[number];
export const CHECK_SEVERITIES = ['error', 'warning'] as const;
export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export interface CheckOptions {
  cwd: string;
  /** 跳过测试，只检查编译 */
  skipTests?: boolean;
  /** 跳过 lint */
  skipLint?: boolean;
  /**
   * 轻量模式（instant profile）：跳过 build+test+lint 重命令，仅保留 typecheck
   * 与结构性门禁（plan-sync / task-file-drift / major-change-gate / context-health）。
   */
  lite?: boolean;
  /** 启用 harness 规则检查 */
  harness?: boolean;
  /** 只检查 pre-flight 规则 */
  preflight?: boolean;
  /** 只检查 boundary 规则 */
  boundary?: boolean;
  /** 只检查 pattern 规则 */
  pattern?: boolean;
  /** 只运行 harness 检查，跳过编译/测试/lint */
  onlyHarness?: boolean;
  /** 强制执行，即使不在 agent 会话中 */
  force?: boolean;
  /** 检测到 active task 文件漂移时按指定来源自动同步 */
  fixDrift?: 'canonical' | 'current' | 'merge';
  /** 显示所有检查项（包括成功项） */
  verbose?: boolean;
  /** 检查后自动运行 review */
  withReview?: boolean;
  /** 禁用交互式提示（脚本/CI 环境） */
  nonInteractive?: boolean;
  /** R-331: 禁用 scope 缓存复用，强制全量执行重 runner */
  noCache?: boolean;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: CheckCategory;
  severity?: CheckSeverity;
  /** 失败是否由环境问题引起（命令缺失、依赖未安装等），而非代码问题 */
  environment_failure?: boolean;
}

export interface GitBaseline {
  ref: string;
  branch: string;
  worktreeDirty: boolean;
}

export interface NodeCommandConfig {
  pkgRunner: string;
  runCmd: string;
}

export interface PackageManifest {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface TaskPlanProgress {
  planDoneCount: number;
  planTotalCount: number;
}

export interface HarnessRule {
  id: string;
  trigger: string;
  level: 'WARN' | 'MUST' | 'INFO';
  description: string;
  enforced?: string;
}

export interface HarnessEvaluation {
  passed: boolean;
  output: string;
}
