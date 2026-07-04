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

export interface WorkflowProfileResolutionInput {
  profile?: unknown;
  level?: number | null;
  requiresSpec?: boolean;
  requiresPlan?: boolean;
  majorChangeRequired?: boolean;
  majorChangeTypes?: string[];
  uiGateRequired?: boolean;
  quickScopeExceededReasons?: string[];
}

export interface WorkflowProfileResolution {
  storedProfile: WorkflowProfile;
  effectiveProfile: WorkflowProfile;
  upgraded: boolean;
  reasons: string[];
}

export function resolveEffectiveWorkflowProfile(input: WorkflowProfileResolutionInput): WorkflowProfileResolution {
  const storedProfile = normalizeWorkflowProfile(input.profile);
  const reasons: string[] = [];
  const level = typeof input.level === 'number' && Number.isFinite(input.level)
    ? Math.floor(input.level)
    : 0;

  if (level >= 2) {
    reasons.push(`任务复杂度级别为 L${level}（quick/instant 限制在 L0/L1）`);
  }
  if (input.requiresSpec) {
    reasons.push('任务需要 spec 门禁');
  }
  if (input.requiresPlan) {
    reasons.push('任务需要 plan 门禁');
  }
  if (input.majorChangeRequired) {
    const types = input.majorChangeTypes?.filter(Boolean) || [];
    reasons.push(types.length > 0
      ? `任务包含重大变更门禁: ${types.join(', ')}`
      : '任务需求规格（spec.md）要求重大变更确认门禁');
  }
  if (input.uiGateRequired) {
    reasons.push('任务需求规格（spec.md）要求 UI 设计门禁');
  }
  for (const reason of input.quickScopeExceededReasons || []) {
    if (reason.trim()) reasons.push(`代码变更超出 quick 限制: ${reason.trim()}`);
  }

  const shouldUpgrade = (storedProfile === 'quick' || storedProfile === 'instant') && reasons.length > 0;
  return {
    storedProfile,
    effectiveProfile: shouldUpgrade ? 'standard' : storedProfile,
    upgraded: shouldUpgrade,
    reasons,
  };
}

export function isQuickProfile(profile: unknown): boolean {
  return normalizeWorkflowProfile(profile) === 'quick';
}

export function isInstantProfile(profile: unknown): boolean {
  return normalizeWorkflowProfile(profile) === 'instant';
}
