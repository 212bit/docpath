/**
 * Type definitions for check command
 */

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
  fixDrift?: 'canonical' | 'current';
  /** 显示所有检查项（包括成功项） */
  verbose?: boolean;
  /** 检查后自动运行 review */
  withReview?: boolean;
  /** 禁用交互式提示（脚本/CI 环境） */
  nonInteractive?: boolean;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: 'compile' | 'test' | 'lint' | 'plan' | 'analysis' | 'context' | 'preflight' | 'boundary' | 'pattern';
  severity?: 'error' | 'warning';
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
