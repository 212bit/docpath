import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFilePromise = promisify(execFile);
const cliBinPath = fileURLToPath(new URL('../../bin/docpath.js', import.meta.url));
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { listBacklogItems } from '../engine/backlog.js';
import { listRegisteredProjects, type RegisteredProject } from '../engine/project-registry.js';
import { parsePlanSteps } from '../utils/doc-parser.js';
import { exists, readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { detectInstallAssetDrift, isInstallTarget, readInstallMetadata } from '../utils/install-core.js';
import { readReviewMarkdown } from '../utils/workspace-evidence.js';
import { listWorktrees } from '../utils/worktree.js';

type DashboardOptions = {
  cwd?: string;
  host?: string;
  port?: number;
};

type DashboardRequestOptions = {
  cwd: string;
};

type DashboardProject = RegisteredProject & {
  source: 'local' | 'registry';
  reachable: boolean;
  status: 'ok' | 'unavailable' | 'partial';
  current: boolean;
  read_error: string | null;
};

type DashboardRoute = {
  next_action: string;
  recommended_command: string | null;
};

type DashboardInstallHealth = {
  passed: boolean;
  target: string | null;
  asset_count: number;
  errors: number;
  warnings: number;
  issue_ids: string[];
  recommended_command: string | null;
};

type DashboardProjectSnapshot = {
  project: DashboardProject;
  state: unknown;
  route: DashboardRoute;
  backlog_counts: Record<string, number>;
  check: {
    latest: unknown | null;
    passed: number;
    failed: number;
  };
  review: ReturnType<typeof summarizeReview>;
  install_health: DashboardInstallHealth;
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

type DashboardEvent = {
  time: string;
  source: 'breadcrumb' | 'check' | 'review';
  status: string;
  severity: 'info' | 'pass' | 'warning' | 'fail' | 'blocked';
  project_root?: string;
  task_id?: string;
  step?: string;
  message: string;
};

type DashboardReviewSummary = ReturnType<typeof summarizeReview>;

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 5179;
const DASHBOARD_DIST_DIR = fileURLToPath(new URL('../dashboard-dist/', import.meta.url));
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function jsonResponse(status: number, payload: unknown): Response {
  const body = JSON.stringify(payload, null, 2);
  return new Response(`${body}\n`, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function htmlResponse(): Response {
  return new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DocPath Dashboard</title>
  </head>
  <body>
    <main>
      <h1>DocPath Dashboard</h1>
      <p>Dashboard server is running. Read-only API implementation is available under /api/*.</p>
    </main>
  </body>
</html>
`, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function fileResponse(filePath: string): Promise<Response> {
  const content = await readFile(filePath);
  return new Response(content, {
    status: 200,
    headers: {
      'content-type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
    },
  });
}

async function staticDashboardResponse(pathname: string): Promise<Response> {
  const distRoot = DASHBOARD_DIST_DIR.endsWith(sep) ? DASHBOARD_DIST_DIR : `${DASHBOARD_DIST_DIR}${sep}`;
  const normalizedPath = normalize(decodeURIComponent(pathname))
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const assetPath = normalizedPath === ''
    ? join(distRoot, 'index.html')
    : join(distRoot, normalizedPath);

  if (!assetPath.startsWith(distRoot)) return jsonResponse(404, { error: 'not_found' });

  try {
    const assetStat = await stat(assetPath);
    if (assetStat.isFile()) return await fileResponse(assetPath);
  } catch {
    // React Router 前端路径回退到 index.html。
  }

  try {
    return await fileResponse(join(distRoot, 'index.html'));
  } catch {
    return htmlResponse();
  }
}

async function sendFetchResponse(response: ServerResponse, fetchResponse: Response, headOnly: boolean): Promise<void> {
  const headers = Object.fromEntries(fetchResponse.headers.entries());
  response.writeHead(fetchResponse.status, headers);
  if (headOnly) {
    response.end();
    return;
  }
  response.end(await fetchResponse.text());
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(`${body}\n`);
}

function parseJsonOrFallback(content: string | null, fallback: unknown): unknown {
  if (!content) return fallback;
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function summarizeReview(markdown: string | null): { status: 'pass' | 'fail' | 'unknown'; errors: number; warnings: number; hints: number } {
  const content = markdown || '';
  const status = /PASS|通过|✅/i.test(content)
    ? 'pass'
    : /FAIL|失败|❌/i.test(content)
      ? 'fail'
      : 'unknown';
  const errors = Number(content.match(/(\d+)\s*(?:错误|error)/i)?.[1] || 0);
  const warnings = Number(content.match(/(\d+)\s*(?:警告|warning|warn)/i)?.[1] || 0);
  const hints = Number(content.match(/(\d+)\s*(?:提示|hint)/i)?.[1] || 0);
  return { status, errors, warnings, hints };
}

async function resolveRequestedRoot(url: URL, cwd: string): Promise<string> {
  const requestedRoot = url.searchParams.get('root');
  if (!requestedRoot || requestedRoot === cwd) return cwd;

  const projects = await listDashboardProjects(cwd);
  if (projects.some((project) => project.root === requestedRoot)) return requestedRoot;
  throw new Error('unknown_project_root');
}

async function buildLocalProject(cwd: string): Promise<DashboardProject> {
  const docpathDir = await resolveDocpathDir(cwd);
  const state = asRecord(await readProjectState(cwd));
  const reachable = await exists(join(docpathDir, 'config.yaml')) || await exists(join(docpathDir, 'workspace', 'state.json'));
  return {
    root: cwd,
    docpath_dir: docpathDir,
    name: basename(cwd) || 'local project',
    description: '',
    type: '-',
    language: '-',
    framework: '-',
    task_id: String(state.task_id || ''),
    task_title: String(state.task_title || ''),
    phase: String(state.phase || 'idle'),
    gate: String(state.gate || 'none'),
    registered_at: '',
    last_seen_at: String(state.updated_at || new Date().toISOString()),
    source: 'local',
    reachable,
    status: reachable ? 'ok' : 'unavailable',
    current: true,
    read_error: null,
  };
}

async function normalizeRegistryProject(project: RegisteredProject, cwd: string): Promise<DashboardProject> {
  const reachable = await exists(join(project.docpath_dir, 'config.yaml')) || await exists(join(project.docpath_dir, 'workspace', 'state.json'));
  return {
    ...project,
    source: project.root === cwd ? 'local' : 'registry',
    reachable,
    status: reachable ? 'ok' : 'unavailable',
    current: project.root === cwd,
    read_error: reachable ? null : 'project_unavailable',
  };
}

async function listDashboardProjects(cwd: string): Promise<DashboardProject[]> {
  const registered = await Promise.all((await listRegisteredProjects()).map((project) => normalizeRegistryProject(project, cwd)));
  if (!registered.some((project) => project.root === cwd)) {
    registered.unshift(await buildLocalProject(cwd));
  }
  return registered.sort((a, b) => {
    if (a.current && !b.current) return -1;
    if (!a.current && b.current) return 1;
    return (b.last_seen_at || '').localeCompare(a.last_seen_at || '') || (a.name || a.root).localeCompare(b.name || b.root);
  });
}

async function readProjectState(projectRoot: string): Promise<unknown> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  return parseJsonOrFallback(
    await readFileSafe(join(docpathDir, 'workspace', 'state.json')),
    null,
  );
}

async function readCheckHistory(projectRoot: string): Promise<unknown[]> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  const parsed = parseJsonOrFallback(
    await readFileSafe(join(docpathDir, 'workspace', 'check-history.json')),
    [],
  );
  return Array.isArray(parsed) ? parsed : [];
}

async function readReview(projectRoot: string): Promise<{ markdown: string; summary: ReturnType<typeof summarizeReview> }> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  const markdown = await readReviewMarkdown(docpathDir);
  return {
    markdown,
    summary: summarizeReview(markdown),
  };
}

function deriveRoute(state: unknown): DashboardRoute {
  const snapshot = asRecord(state);
  const phase = String(snapshot.phase || '');
  const gate = String(snapshot.gate || '');
  const taskId = String(snapshot.task_id || '');
  const currentStep = String(snapshot.current_step || '');

  if (!taskId) {
    return {
      next_action: 'No active task. Capture or promote backlog before execution.',
      recommended_command: 'docpath backlog capture --title <title>',
    };
  }
  if (phase === 'planning' || phase === 'drafting') {
    return {
      next_action: phase === 'drafting' ? 'Spec is ready; generate the execution plan.' : 'Plan is ready; start the next open step.',
      recommended_command: phase === 'drafting' ? 'docpath plan' : 'docpath go --step <step>',
    };
  }
  if (phase === 'executing') {
    return {
      next_action: currentStep ? `Continue current step: ${currentStep}` : 'Continue the active execution step.',
      recommended_command: currentStep ? `docpath agent step --step ${currentStep} --status done` : 'docpath next --agent',
    };
  }
  if (phase === 'reviewing' || gate.includes('check')) {
    return { next_action: 'Quality gates are pending or failed.', recommended_command: 'docpath check' };
  }
  if (phase === 'completed') {
    return { next_action: 'Task is complete. Capture or promote the next backlog item.', recommended_command: 'docpath backlog capture --title <title>' };
  }
  return { next_action: 'Read the active route before taking action.', recommended_command: 'docpath next --agent' };
}

async function readTaskProgress(projectRoot: string, state: unknown): Promise<DashboardProjectSnapshot['task_progress']> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  const taskId = String(asRecord(state).task_id || '');
  const planPaths = [
    join(docpathDir, 'tasks', 'current', 'plan.md'),
    taskId ? join(docpathDir, 'tasks', taskId, 'plan.md') : '',
  ].filter(Boolean);
  for (const planPath of planPaths) {
    const content = await readFileSafe(planPath);
    if (!content) continue;
    const steps = parsePlanSteps(content);
    return {
      done: steps.filter((step) => step.done).length,
      total: steps.length,
      blocked: steps.filter((step) => step.marker === '!').length,
      current_step: String(asRecord(state).current_step || ''),
    };
  }
  return { done: 0, total: 0, blocked: 0, current_step: String(asRecord(state).current_step || '') };
}

async function readInstallHealth(projectRoot: string): Promise<DashboardInstallHealth> {
  const docpathDir = await resolveDocpathDir(projectRoot);
  try {
    const meta = await readInstallMetadata(docpathDir);
    if (!meta) {
      return {
        passed: false,
        target: null,
        asset_count: 0,
        errors: 1,
        warnings: 0,
        issue_ids: ['install-meta-missing'],
        recommended_command: 'docpath install --target universal',
      };
    }
    const target = isInstallTarget(meta.target) ? meta.target : 'universal';
    const report = await detectInstallAssetDrift(projectRoot, meta, {
      target,
      projectName: meta.projectName || basename(projectRoot) || 'docpath project',
    });
    return {
      passed: !report.hasDrift,
      target: report.target,
      asset_count: report.assetCount,
      errors: report.hasDrift ? 1 : 0,
      warnings: 0,
      issue_ids: report.hasDrift ? ['install-manifest-drift'] : [],
      recommended_command: report.hasDrift ? `docpath install --target ${report.target}` : null,
    };
  } catch (error) {
    return {
      passed: false,
      target: null,
      asset_count: 0,
      errors: 1,
      warnings: 0,
      issue_ids: ['install-health-error'],
      recommended_command: 'docpath install --target universal',
    };
  }
}

function countBacklog(items: Array<{ status: string }>): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
}

function summarizeChecks(history: unknown[]): DashboardProjectSnapshot['check'] {
  const passed = history.filter((entry) => Boolean(asRecord(entry).passed)).length;
  return {
    latest: history.at(-1) || null,
    passed,
    failed: history.length - passed,
  };
}

function eventSeverity(status: string): DashboardEvent['severity'] {
  if (status === 'blocked') return 'blocked';
  if (status === 'fail' || status === 'failed' || status === 'false') return 'fail';
  if (status === 'pass' || status === 'passed' || status === 'done' || status === 'true') return 'pass';
  if (status === 'warning' || status === 'warn') return 'warning';
  return 'info';
}

async function readDashboardEvents(projectRoot: string, limit: number): Promise<{ events: DashboardEvent[]; truncated: boolean }> {
  const events: DashboardEvent[] = [];
  const breadcrumb = await readBreadcrumb(projectRoot);
  for (const entry of breadcrumb.entries.slice(-limit)) {
    events.push({
      time: entry.timestamp || '',
      source: 'breadcrumb',
      status: entry.status,
      severity: eventSeverity(entry.status),
      task_id: entry.taskId,
      step: entry.step,
      message: entry.context,
    });
  }
  const checks = await readCheckHistory(projectRoot);
  for (const check of checks.slice(-Math.min(limit, 20))) {
    const record = asRecord(check);
    const passed = Boolean(record.passed);
    events.push({
      time: String(record.timestamp || ''),
      source: 'check',
      status: passed ? 'pass' : 'fail',
      severity: passed ? 'pass' : 'fail',
      message: passed ? 'Check passed' : `Check failed: ${(record.failedChecks as string[] | undefined)?.join(', ') || 'unknown'}`,
    });
  }
  const review = await readReview(projectRoot);
  if (review.markdown) {
    events.push({
      time: '',
      source: 'review',
      status: review.summary.status,
      severity: eventSeverity(review.summary.status),
      message: `Review ${review.summary.status}: ${review.summary.errors} errors, ${review.summary.warnings} warnings, ${review.summary.hints} hints`,
    });
  }
  const sorted = events
    .filter((event) => event.message)
    .sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  return {
    events: sorted.slice(0, limit),
    truncated: sorted.length > limit || breadcrumb.entries.length > limit,
  };
}

async function readProjectSnapshot(project: DashboardProject): Promise<DashboardProjectSnapshot> {
  const errors: string[] = [];
  if (!project.reachable) {
    return {
      project,
      state: null,
      route: { next_action: 'Project is unavailable on disk.', recommended_command: null },
      backlog_counts: {},
      check: { latest: null, passed: 0, failed: 0 },
      review: { status: 'unknown', errors: 0, warnings: 0, hints: 0 },
      install_health: { passed: false, target: null, asset_count: 0, errors: 1, warnings: 0, issue_ids: ['project-unavailable'], recommended_command: null },
      events: { latest: null, count: 0, truncated: false },
      task_progress: { done: 0, total: 0, blocked: 0, current_step: '' },
      errors: ['project_unavailable'],
    };
  }

  let state: unknown = null;
  let backlog: Awaited<ReturnType<typeof listBacklogItems>> = [];
  let checks: unknown[] = [];
  let reviewSummary: DashboardReviewSummary = { status: 'unknown', errors: 0, warnings: 0, hints: 0 };
  let installHealth: DashboardInstallHealth = { passed: false, target: null, asset_count: 0, errors: 0, warnings: 0, issue_ids: [], recommended_command: null };
  let events = { events: [] as DashboardEvent[], truncated: false };
  let taskProgress: DashboardProjectSnapshot['task_progress'] = { done: 0, total: 0, blocked: 0, current_step: '' };

  try { state = await readProjectState(project.root); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { backlog = await listBacklogItems(project.root); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { checks = await readCheckHistory(project.root); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { reviewSummary = (await readReview(project.root)).summary; } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { installHealth = await readInstallHealth(project.root); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { events = await readDashboardEvents(project.root, 20); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  try { taskProgress = await readTaskProgress(project.root, state); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }

  return {
    project: errors.length > 0 ? { ...project, status: 'partial', read_error: errors[0] || null } : project,
    state,
    route: deriveRoute(state),
    backlog_counts: countBacklog(backlog),
    check: summarizeChecks(checks),
    review: reviewSummary,
    install_health: installHealth,
    events: {
      latest: events.events[0] || null,
      count: events.events.length,
      truncated: events.truncated,
    },
    task_progress: taskProgress,
    errors,
  };
}

function buildDashboardMetrics(snapshots: DashboardProjectSnapshot[]) {
  const active = snapshots.filter((snapshot) => Boolean(asRecord(snapshot.state).task_id) && asRecord(snapshot.state).phase !== 'completed').length;
  const blocked = snapshots.filter((snapshot) => snapshot.project.status === 'unavailable' || String(asRecord(snapshot.state).phase) === 'blocked' || String(asRecord(snapshot.state).gate).includes('fail')).length;
  const failedGates = snapshots.filter((snapshot) => snapshot.check.latest && !Boolean(asRecord(snapshot.check.latest).passed)).length;
  const staleOrUnavailable = snapshots.filter((snapshot) => snapshot.project.status !== 'ok').length;
  return {
    projects: snapshots.length,
    active_tasks: active,
    blocked_projects: blocked,
    failed_gates: failedGates,
    stale_or_unavailable: staleOrUnavailable,
    install_failures: snapshots.filter((snapshot) => !snapshot.install_health.passed).length,
  };
}

async function readDashboardSummary(cwd: string) {
  const projects = await listDashboardProjects(cwd);
  const snapshots = await Promise.all(projects.map((project) => readProjectSnapshot(project)));
  return {
    generated_at: new Date().toISOString(),
    cwd,
    projects,
    metrics: buildDashboardMetrics(snapshots),
    snapshots,
    attention: snapshots
      .map((snapshot) => ({
        project_root: snapshot.project.root,
        project_name: snapshot.project.name,
        reason: snapshot.project.status === 'unavailable'
          ? 'Project unavailable'
          : !snapshot.install_health.passed
            ? 'Install health failed'
            : snapshot.check.latest && !Boolean(asRecord(snapshot.check.latest).passed)
              ? 'Latest check failed'
              : String(asRecord(snapshot.state).task_id)
                ? 'Active task'
                : 'No active task',
        severity: snapshot.project.status === 'unavailable' || !snapshot.install_health.passed ? 'fail' : String(asRecord(snapshot.state).task_id) ? 'info' : 'pass',
        phase: String(asRecord(snapshot.state).phase || snapshot.project.phase || 'idle'),
        gate: String(asRecord(snapshot.state).gate || snapshot.project.gate || 'none'),
        task_title: String(asRecord(snapshot.state).task_title || snapshot.project.task_title || ''),
        recommended_command: snapshot.route.recommended_command,
      }))
      .sort((a, b) => {
        const weight = (severity: string) => severity === 'fail' ? 0 : severity === 'info' ? 1 : 2;
        return weight(a.severity) - weight(b.severity) || a.project_name.localeCompare(b.project_name);
      }),
  };
}

async function handleDashboardFetchInner(request: Request, options: DashboardRequestOptions): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method || 'GET';
  const path = url.pathname;

  if (method !== 'GET' && method !== 'HEAD' && method !== 'POST' && method !== 'DELETE') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const readonlyPaths = [
    '/api/health',
    '/api/projects',
    '/api/summary',
    '/api/state',
    '/api/checks',
    '/api/review',
    '/api/backlog',
    '/api/events',
    '/api/workspaces',
  ];
  if (readonlyPaths.includes(path) && method !== 'GET' && method !== 'HEAD') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  if (path === '/api/health') {
    return jsonResponse(200, {
      ok: true,
      mode: 'active',
      endpoints: ['/api/projects', '/api/summary', '/api/state', '/api/checks', '/api/review', '/api/backlog', '/api/events', '/api/workspaces', '/api/actions/execute'],
    });
  }

  if (path === '/api/projects') {
    return jsonResponse(200, { projects: await listDashboardProjects(options.cwd) });
  }

  if (path === '/api/summary') {
    return jsonResponse(200, await readDashboardSummary(options.cwd));
  }

  if (path === '/api/state') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    const state = asRecord(await readProjectState(projectRoot));
    const docpathDir = await resolveDocpathDir(projectRoot);
    const taskId = String(state.task_id || '');
    const planPaths = [
      join(docpathDir, 'tasks', 'current', 'plan.md'),
      taskId ? join(docpathDir, 'tasks', taskId, 'plan.md') : '',
    ].filter(Boolean);

    let steps: any[] = [];
    for (const planPath of planPaths) {
      const content = await readFileSafe(planPath);
      if (content) {
        steps = parsePlanSteps(content);
        break;
      }
    }
    return jsonResponse(200, { projectRoot, state, steps });
  }

  if (path === '/api/checks') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, history: await readCheckHistory(projectRoot) });
  }

  if (path === '/api/review') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, review: await readReview(projectRoot) });
  }

  if (path === '/api/backlog') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    return jsonResponse(200, { projectRoot, items: await listBacklogItems(projectRoot) });
  }

  if (path === '/api/events') {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 100)));
    return jsonResponse(200, { projectRoot, limit, ...await readDashboardEvents(projectRoot, limit) });
  }

  if (path === '/api/workspaces') {
    const docpathDir = await resolveDocpathDir(options.cwd);
    let worktrees: any[] = [];
    try {
      worktrees = await listWorktrees(options.cwd);
    } catch {
      // Ignore
    }

    const sessionsPath = join(docpathDir, 'workspace', 'sessions');
    let sessions: any[] = [];
    if (existsSync(sessionsPath)) {
      try {
        const files = await readdir(sessionsPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await readFile(join(sessionsPath, file), 'utf-8');
            sessions.push(JSON.parse(content));
          }
        }
      } catch {}
    }

    const leasesPath = join(docpathDir, 'workspace', 'leases');
    let leases: any[] = [];
    if (existsSync(leasesPath)) {
      try {
        const files = await readdir(leasesPath);
        for (const file of files) {
          if (file.endsWith('.json')) {
            const content = await readFile(join(leasesPath, file), 'utf-8');
            leases.push(JSON.parse(content));
          }
        }
      } catch {}
    }

    return jsonResponse(200, { worktrees, sessions, leases });
  }

  if (method === 'POST' && path === '/api/actions/execute') {
    let body: any;
    try {
      body = await request.json();
    } catch (err) {
      return jsonResponse(400, { error: 'invalid_json_body' });
    }

    const { root, action, args } = body;
    const projectRoot = root ? await resolveRequestedRoot(url, options.cwd) : options.cwd;

    if (action !== 'go' && action !== 'step' && action !== 'agent') {
      return jsonResponse(400, { error: 'forbidden_action' });
    }

    // Build arguments array
    const cmdArgs = [cliBinPath];
    if (action === 'agent' && args.action) {
      cmdArgs.push('agent', args.action);
    } else {
      cmdArgs.push(action);
    }

    // Add key-value arguments
    for (const [key, val] of Object.entries(args || {})) {
      if (key === 'action') continue;
      if (val === true || val === 'true') {
        cmdArgs.push(`--${key}`);
      } else if (val) {
        cmdArgs.push(`--${key}`, String(val));
      }
    }

    const fullCommand = `node ${cmdArgs.join(' ')}`;

    try {
      const { stdout, stderr } = await execFilePromise('node', cmdArgs, { cwd: projectRoot });
      return jsonResponse(200, {
        command: fullCommand,
        code: 0,
        stdout,
        stderr,
      });
    } catch (error: any) {
      return jsonResponse(200, {
        command: fullCommand,
        code: error.code || 1,
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || String(error),
      });
    }
  }

  if (method === 'DELETE' && path.startsWith('/api/workspaces/sessions/')) {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    const docpathDir = await resolveDocpathDir(projectRoot);
    const sessionId = decodeURIComponent(path.slice('/api/workspaces/sessions/'.length));
    if (!sessionId || sessionId.includes('/') || sessionId.includes('..')) {
      return jsonResponse(400, { error: 'invalid_session_id' });
    }
    const sessionFile = join(docpathDir, 'workspace', 'sessions', `${sessionId}.json`);
    if (existsSync(sessionFile)) {
      await unlink(sessionFile);
      return jsonResponse(200, { success: true });
    }
    return jsonResponse(404, { error: 'session_not_found' });
  }

  if (method === 'DELETE' && path.startsWith('/api/workspaces/leases/')) {
    const projectRoot = await resolveRequestedRoot(url, options.cwd);
    const docpathDir = await resolveDocpathDir(projectRoot);
    const resource = decodeURIComponent(path.slice('/api/workspaces/leases/'.length));
    const safeName = encodeURIComponent(resource).replace(/%/g, '_');
    const leaseFile = join(docpathDir, 'workspace', 'leases', `${safeName}.json`);
    const leaseLock = join(docpathDir, 'workspace', 'leases', `${safeName}.lock`);
    let deleted = false;
    if (existsSync(leaseFile)) {
      await unlink(leaseFile);
      deleted = true;
    }
    if (existsSync(leaseLock)) {
      await unlink(leaseLock);
    }
    if (deleted) {
      return jsonResponse(200, { success: true });
    }
    return jsonResponse(404, { error: 'lease_not_found' });
  }

  if (!path.startsWith('/api/')) return await staticDashboardResponse(path);

  return jsonResponse(404, { error: 'not_found' });
}

export async function handleDashboardFetch(request: Request, options: DashboardRequestOptions): Promise<Response> {
  try {
    return await handleDashboardFetchInner(request, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(message === 'unknown_project_root' ? 404 : 500, { error: message });
  }
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

async function handleDashboardRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: DashboardRequestOptions,
): Promise<void> {
  const requestUrl = request.url ? new URL(request.url, 'http://localhost') : new URL('/', 'http://localhost');
  try {
    let body: Buffer | undefined;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      body = await readBody(request);
    }
    const fetchResponse = await handleDashboardFetch(
      new Request(requestUrl, {
        method: request.method || 'GET',
        headers: request.headers as HeadersInit,
        body,
        duplex: body ? 'half' : undefined,
      } as RequestInit),
      options,
    );
    await sendFetchResponse(response, fetchResponse, request.method === 'HEAD');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, message === 'unknown_project_root' ? 404 : 500, { error: message });
  }
}

export async function dashboardCommand(options: DashboardOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const host = options.host || DEFAULT_HOST;
  const port = options.port || DEFAULT_PORT;
  const server = createServer((request, response) => {
    void handleDashboardRequest(request, response, { cwd });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(`\nDocPath dashboard listening on http://${host}:${port}`);
  console.log('Mode: active\n');
  console.log('Dev UI: pnpm exec vite --config vite.dashboard.config.ts\n');
}
