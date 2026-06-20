export type ProjectSummary = {
  root: string;
  docpath_dir: string;
  name: string;
  description?: string;
  type?: string;
  language?: string;
  framework?: string;
  task_id: string;
  task_title: string;
  phase: string;
  gate: string;
  registered_at?: string;
  last_seen_at: string;
  source?: 'local' | 'registry';
  reachable?: boolean;
  status?: 'ok' | 'unavailable' | 'partial';
  current?: boolean;
  read_error?: string | null;
};

export type WorkflowState = {
  task_id?: string;
  task_title?: string;
  phase?: string;
  gate?: string;
  current_step?: string;
  updated_at?: string;
};

export type DashboardRoute = {
  next_action: string;
  recommended_command: string | null;
};

export type CheckHistoryEntry = {
  timestamp: string;
  passed: boolean;
  failedChecks: string[];
};

export type ReviewSummary = {
  status: 'pass' | 'fail' | 'unknown';
  errors: number;
  warnings: number;
  hints: number;
};

export type ReviewPayload = {
  markdown: string;
  summary: ReviewSummary;
};

export type BacklogItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  readiness?: string;
  level: number;
  links: {
    task: string | null;
    spec: string | null;
  };
  created_at: string;
  body: string;
};

export type DashboardEvent = {
  time: string;
  source: 'breadcrumb' | 'check' | 'review';
  status: string;
  severity: 'info' | 'pass' | 'warning' | 'fail' | 'blocked';
  project_root?: string;
  task_id?: string;
  step?: string;
  message: string;
};

export type InstallHealth = {
  passed: boolean;
  target: string | null;
  asset_count: number;
  errors: number;
  warnings: number;
  issue_ids: string[];
  recommended_command: string | null;
};

export type ProjectSnapshot = {
  project: ProjectSummary;
  state: WorkflowState | null;
  route: DashboardRoute;
  backlog_counts: Record<string, number>;
  check: {
    latest: CheckHistoryEntry | null;
    passed: number;
    failed: number;
  };
  review: ReviewSummary;
  install_health: InstallHealth;
  events: {
    latest: DashboardEvent | null;
    count: number;
    truncated: boolean;
  };
  task_progress: {
    done: number;
    total: number;
    blocked: number;
    current_step: string;
  };
  errors: string[];
};

export type DashboardSummary = {
  generated_at: string;
  cwd: string;
  projects: ProjectSummary[];
  metrics: {
    projects: number;
    active_tasks: number;
    blocked_projects: number;
    failed_gates: number;
    stale_or_unavailable: number;
    install_failures: number;
  };
  snapshots: ProjectSnapshot[];
  attention: Array<{
    project_root: string;
    project_name: string;
    reason: string;
    severity: string;
    phase: string;
    gate: string;
    task_title: string;
    recommended_command: string | null;
  }>;
};

type JsonObject = Record<string, unknown>;

async function getJson<T extends JsonObject>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return await response.json() as T;
}

function rootQuery(root: string | null): string {
  return root ? `?root=${encodeURIComponent(root)}` : '';
}

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const payload = await getJson<{ projects: ProjectSummary[] }>('/api/projects');
  return payload.projects;
}

export async function fetchSummary(): Promise<DashboardSummary> {
  return await getJson<DashboardSummary>('/api/summary');
}

export type PlanStep = {
  id: string;
  name: string;
  description: string;
  acceptance: string;
  dependencies: string;
  done: boolean;
  marker: ' ' | 'x' | '~' | '!';
};

export async function fetchState(root: string | null): Promise<{ state: WorkflowState | null; steps: PlanStep[] }> {
  const payload = await getJson<{ state: WorkflowState | null; steps: PlanStep[] }>(`/api/state${rootQuery(root)}`);
  return { state: payload.state, steps: payload.steps || [] };
}

export async function fetchChecks(root: string | null): Promise<CheckHistoryEntry[]> {
  const payload = await getJson<{ history: CheckHistoryEntry[] }>(`/api/checks${rootQuery(root)}`);
  return payload.history;
}

export async function fetchReview(root: string | null): Promise<ReviewPayload> {
  const payload = await getJson<{ review: ReviewPayload }>(`/api/review${rootQuery(root)}`);
  return payload.review;
}

export async function fetchBacklog(root: string | null): Promise<BacklogItem[]> {
  const payload = await getJson<{ items: BacklogItem[] }>(`/api/backlog${rootQuery(root)}`);
  return payload.items;
}

export async function fetchEvents(root: string | null, limit = 100): Promise<{ events: DashboardEvent[]; truncated: boolean; limit: number }> {
  const separator = rootQuery(root) ? '&' : '?';
  const payload = await getJson<{ events: DashboardEvent[]; truncated: boolean; limit: number }>(
    `/api/events${rootQuery(root)}${separator}limit=${limit}`,
  );
  return payload;
}

export type WorktreeInfo = {
  path: string;
  branch: string;
  head: string;
  bare: boolean;
  detached: boolean;
};

export type SessionRecord = {
  schema_version: number;
  kind: 'session';
  session_id: string;
  pid: number;
  cwd: string;
  command: string;
  task_id?: string;
  step?: string;
  created_at: string;
  updated_at: string;
};

export type LeaseRecord = {
  schema_version: number;
  kind: 'lease';
  resource: string;
  session_id: string;
  pid: number;
  command: string;
  task_id: string;
  step?: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type WorkspacesPayload = {
  worktrees: WorktreeInfo[];
  sessions: SessionRecord[];
  leases: LeaseRecord[];
};

export async function fetchWorkspaces(): Promise<WorkspacesPayload> {
  return await getJson<WorkspacesPayload & JsonObject>('/api/workspaces');
}

