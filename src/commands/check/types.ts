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
  /** R-350: 禁用环境豁免（默认开启）——即使全部失败项都是环境类也按失败处理 */
  noEnvExempt?: boolean;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: CheckCategory;
  severity?: CheckSeverity;
  /** 失败是否由环境问题引起（命令缺失、依赖未安装等），而非代码问题 */
  environment_failure?: boolean;
  /**
   * R-350: 该环境失败是否**确定性可证**，可用于 check_env_exempt 豁免通道。
   * 仅两类为真：(a) runner 探针路径（临时目录真跑探针证明 runner 不可用）；
   * (b) 工具链语义明确的输出（command not found / spawn ENOENT / Permission denied）。
   * 歧义模式（Cannot find module / MODULE_NOT_FOUND / ENOENT.*node_modules）保持 false——
   * 它们更可能是真实缺依赖或代码问题，恢复动作是 pnpm install 或改代码。
   */
  environment_exemptible?: boolean;
  /** R-347: 实际执行的外部命令（仅外部 runner 有；结构/上下文类检查无）。供 agent 判断门禁已跑过什么，避免重复手跑。 */
  command?: string;
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
