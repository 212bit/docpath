/**
 * DocPath Check & Quality Gate Types (Layer 0)
 */

export const CHECK_CATEGORIES = [
  'compile',
  'test',
  'lint',
  'plan',
  'analysis',
  'context',
  'preflight',
  'boundary',
  'pattern',
] as const;

export type CheckCategory = (typeof CHECK_CATEGORIES)[number];

export const CHECK_SEVERITIES = ['error', 'warning'] as const;

export type CheckSeverity = (typeof CHECK_SEVERITIES)[number];

export interface CheckOptions {
  cwd: string;
  skipTests?: boolean;
  skipLint?: boolean;
  lite?: boolean;
  harness?: boolean;
  preflight?: boolean;
  boundary?: boolean;
  pattern?: boolean;
  onlyHarness?: boolean;
  force?: boolean;
  fixDrift?: 'canonical' | 'current' | 'merge';
  verbose?: boolean;
  withReview?: boolean;
  nonInteractive?: boolean;
  noCache?: boolean;
  noEnvExempt?: boolean;
  testScope?: 'full' | 'touched';
  allTests?: boolean;
  fix?: boolean;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  output: string;
  category?: CheckCategory;
  severity?: CheckSeverity;
  environment_failure?: boolean;
  environment_exemptible?: boolean;
  command?: string;
  cached?: boolean;
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
