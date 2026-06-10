export type ProjectSummary = {
  root: string;
  docpath_dir: string;
  name: string;
  task_id: string;
  task_title: string;
  phase: string;
  gate: string;
  last_seen_at: string;
};

export type WorkflowState = {
  task_id?: string;
  task_title?: string;
  phase?: string;
  gate?: string;
  current_step?: string;
  updated_at?: string;
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
  level: number;
  links: {
    task: string | null;
    spec: string | null;
  };
  created_at: string;
  body: string;
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

export async function fetchState(root: string | null): Promise<WorkflowState | null> {
  const payload = await getJson<{ state: WorkflowState | null }>(`/api/state${rootQuery(root)}`);
  return payload.state;
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
