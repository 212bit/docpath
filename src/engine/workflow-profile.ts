import { normalizeRiskTier } from './risk.js';
import {
  type WorkflowProfile,
  DEFAULT_WORKFLOW_PROFILE,
  normalizeWorkflowProfile,
} from '../types/state.js';

export {
  type WorkflowProfile,
  DEFAULT_WORKFLOW_PROFILE,
  normalizeWorkflowProfile,
};

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


export function gatePolicyForProfile(profile: unknown): GatePolicy {
  return PROFILE_POLICIES[normalizeWorkflowProfile(profile)];
}

export interface WorkflowProfileResolutionInput {
  profile?: unknown;
  level?: number | null;
  /** 任务风险档位（R-338）；接受宽松 number，缺省按 R1 处理，不改变既有行为 */
  riskTier?: number | null;
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
  const riskTier = normalizeRiskTier(input.riskTier);
  if ((storedProfile === 'quick' || storedProfile === 'instant') && riskTier >= 2) {
    reasons.push(`任务风险达到 R${riskTier}（quick/instant 仅限 R0/R1）`);
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

/**
 * R-338: 门禁策略解析 —— risk × level 函数化入口。
 *
 * 先走 resolveEffectiveWorkflowProfile（quick/instant 在风险 R2+ 时升级
 * standard），再对解析出的 effectiveProfile 施加风险地板：
 * - R2+：必须 check + review，journal full；
 * - R3+：还必须 spec + plan，禁用 liteCheck。
 * 地板只增不减，保证同 level 下风险越高门禁强度单调不减。
 */
export interface ResolveGatePolicyInput extends WorkflowProfileResolutionInput {
}

export interface GatePolicyResolution {
  policy: GatePolicy;
  storedProfile: WorkflowProfile;
  effectiveProfile: WorkflowProfile;
  upgraded: boolean;
  reasons: string[];
  riskTier: number;
}

export function resolveGatePolicy(input: ResolveGatePolicyInput): GatePolicyResolution {
  const resolution = resolveEffectiveWorkflowProfile(input);
  const riskTier = normalizeRiskTier(input.riskTier);
  const policy: GatePolicy = { ...PROFILE_POLICIES[resolution.effectiveProfile] };
  const floorReasons: string[] = [];

  if (riskTier >= 2) {
    if (!policy.requiresCheck) {
      policy.requiresCheck = true;
      floorReasons.push(`风险 R${riskTier} 强制 check 门禁`);
    }
    if (!policy.requiresReview) {
      policy.requiresReview = true;
      floorReasons.push(`风险 R${riskTier} 强制 review 门禁`);
    }
    if (policy.journalMode !== 'full') {
      policy.journalMode = 'full';
      floorReasons.push(`风险 R${riskTier} 强制完整 journal`);
    }
    if (policy.liteCheck) {
      policy.liteCheck = false;
      floorReasons.push(`风险 R${riskTier} 禁用 liteCheck`);
    }
  }
  if (riskTier >= 3) {
    if (!policy.requiresSpec) {
      policy.requiresSpec = true;
      floorReasons.push(`风险 R${riskTier} 强制 spec 门禁`);
    }
    if (!policy.requiresPlan) {
      policy.requiresPlan = true;
      floorReasons.push(`风险 R${riskTier} 强制 plan 门禁`);
    }
  }

  return {
    policy,
    storedProfile: resolution.storedProfile,
    effectiveProfile: resolution.effectiveProfile,
    upgraded: resolution.upgraded || floorReasons.length > 0,
    reasons: [...resolution.reasons, ...floorReasons],
    riskTier,
  };
}
