export type WorkflowProfile = 'quick' | 'standard' | 'strict' | 'instant';

export interface GatePolicy {
  requiresSpec: boolean;
  requiresPlan: boolean;
  requiresCheck: boolean;
  requiresReview: boolean;
  journalMode: 'minimal' | 'full';
  /**
   * 轻量 check 模式：跳过 build+test+lint 等重命令，仅保留 typecheck + 结构性门禁
   * （plan-sync / task-file-drift / major-change-gate / context-health）。
   * 用于 instant profile —— 「跳 check 但留 typecheck」：完整 check 门禁不要求，
   * 但 typecheck 仍作为防低级类型错误的兜底。
   */
  liteCheck: boolean;
}

export const DEFAULT_WORKFLOW_PROFILE: WorkflowProfile = 'standard';

const PROFILE_POLICIES: Record<WorkflowProfile, GatePolicy> = {
  quick: {
    requiresSpec: false,
    requiresPlan: false,
    requiresCheck: true,
    requiresReview: false,
    journalMode: 'minimal',
    liteCheck: false,
  },
  standard: {
    requiresSpec: true,
    requiresPlan: true,
    requiresCheck: true,
    requiresReview: true,
    journalMode: 'full',
    liteCheck: false,
  },
  strict: {
    requiresSpec: true,
    requiresPlan: true,
    requiresCheck: true,
    requiresReview: true,
    journalMode: 'full',
    liteCheck: false,
  },
  instant: {
    requiresSpec: false,
    requiresPlan: false,
    requiresCheck: false,
    requiresReview: false,
    journalMode: 'minimal',
    liteCheck: true,
  },
};

export function normalizeWorkflowProfile(value: unknown): WorkflowProfile {
  return value === 'quick' || value === 'strict' || value === 'instant' ? value : DEFAULT_WORKFLOW_PROFILE;
}

export function gatePolicyForProfile(profile: unknown): GatePolicy {
  return PROFILE_POLICIES[normalizeWorkflowProfile(profile)];
}

export function isQuickProfile(profile: unknown): boolean {
  return normalizeWorkflowProfile(profile) === 'quick';
}

export function isInstantProfile(profile: unknown): boolean {
  return normalizeWorkflowProfile(profile) === 'instant';
}
