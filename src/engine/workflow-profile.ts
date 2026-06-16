export type WorkflowProfile = 'quick' | 'standard' | 'strict';

export interface GatePolicy {
  requiresSpec: boolean;
  requiresPlan: boolean;
  requiresCheck: boolean;
  requiresReview: boolean;
  journalMode: 'minimal' | 'full';
}

export const DEFAULT_WORKFLOW_PROFILE: WorkflowProfile = 'standard';

const PROFILE_POLICIES: Record<WorkflowProfile, GatePolicy> = {
  quick: {
    requiresSpec: false,
    requiresPlan: false,
    requiresCheck: true,
    requiresReview: false,
    journalMode: 'minimal',
  },
  standard: {
    requiresSpec: true,
    requiresPlan: true,
    requiresCheck: true,
    requiresReview: true,
    journalMode: 'full',
  },
  strict: {
    requiresSpec: true,
    requiresPlan: true,
    requiresCheck: true,
    requiresReview: true,
    journalMode: 'full',
  },
};

export function normalizeWorkflowProfile(value: unknown): WorkflowProfile {
  return value === 'quick' || value === 'strict' ? value : DEFAULT_WORKFLOW_PROFILE;
}

export function gatePolicyForProfile(profile: unknown): GatePolicy {
  return PROFILE_POLICIES[normalizeWorkflowProfile(profile)];
}

export function isQuickProfile(profile: unknown): boolean {
  return normalizeWorkflowProfile(profile) === 'quick';
}
