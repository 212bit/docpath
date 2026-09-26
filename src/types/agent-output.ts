/**
 * DocPath Agent Output & Context Types (Layer 0)
 */

import type { BreadcrumbEntry, BreadcrumbSummary } from './breadcrumb.js';

export interface DecisionEntry {
  id: string;
  taskId: string;
  category: string;
  conclusion: string;
  createdAt: string;
  relatedFiles?: string[];
  context?: string;
  score?: number;
}

export interface SpecSummary {
  title: string;
  requirements: string[];
}

export interface PlanTaskItem {
  id: string;
  title: string;
  done: boolean;
  inProgress?: boolean;
}

export interface AgentOutputContext {
  cwd: string;
  state: Record<string, unknown> | null;
  specContent: string | null;
  planContent: string | null;
  planTasks: PlanTaskItem[];
  breadcrumbSummary: BreadcrumbSummary;
  recentDecisions: DecisionEntry[];
  lastCheckContent: string | null;
  lessonSummary: {
    pendingCount: number;
    pendingKeys: string[];
  };
}

export interface AgentFocusContext {
  planTasks?: Array<{ id: string; title: string; done: boolean; inProgress?: boolean }>;
  lastCheckContent?: string | null;
  lessonSummary?: {
    pendingCount: number;
    pendingKeys?: string[];
  };
}

export interface AgentOutput {
  agent_view: string;
  state: string;
  level: number;
  workflow_profile: string;
  task_id: string;
  task_title: string;
  phase: string;
  gate: string;
  next_action: string;
  recommended_command: string;
  exit_criteria?: string;
  context_refs?: Array<{ path: string; role: string; access: string; preferred_command?: string }>;
  command_effects?: {
    updates?: string[];
    update_mode?: string;
    do_not_edit_directly?: string[];
  };
  progress?: {
    done: number;
    total: number;
    in_progress: number;
    blocked: number;
  };
  lesson_summary?: {
    pending_count: number;
  };
  [key: string]: unknown;
}
