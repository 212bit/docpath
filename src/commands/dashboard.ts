/**
 * docpath dashboard — 本地只读 Agent 工作台。
 *
 * 第一版只读取 .docpath 数据，不写入状态；默认启动本地 HTTP 页面。
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import { DashboardApp } from '../dashboard-ui/App.js';
import { readBreadcrumb } from '../engine/breadcrumb.js';
import { listBacklogItems } from '../engine/backlog.js';
import { listRegisteredProjects, resolveProjectRegistryDbPath, type RegisteredProject } from '../engine/project-registry.js';
import { buildChangesReport, type ChangesReport } from './changes.js';
import { buildInstallDoctorReport, isInstallTarget } from './install.js';
import { resolveDocpathDir } from '../utils/file.js';
import { parsePlanTasks, readCurrentState, readOptionalFile } from '../utils/workspace.js';

type DashboardOptions = {
  cwd: string;
  host?: string;
  port?: number;
  print?: boolean;
  json?: boolean;
  project?: string;
  root?: string;
  status?: string;
  priority?: string;
  q?: string;
};

type ProjectSelection = {
  project?: string | null;
  root?: string | null;
};

type DashboardQuery = ProjectSelection & {
  status?: string | null;
  priority?: string | null;
  q?: string | null;
};

const DEFAULT_DASHBOARD_HOST = '127.0.0.1';
const DEFAULT_DASHBOARD_PORT = 7181;
const DASHBOARD_API_PATH = '/api/state';
const DASHBOARD_UI_CSS_PATH = join(process.cwd(), 'dist', 'dashboard-ui', 'dashboard-ui.css');

type EvidenceSummary = {
  time: string | null;
  result: string;
  items: string[];
  raw: string;
};

type ProjectSummary = {
  name: string;
  type: string;
  language: string;
  framework: string;
  root: string;
  docpath_dir: string;
  task_dirs: number;
  backlog_total: number;
  backlog_by_status: Record<string, number>;
  lesson_pending_count: number;
  install_health: {
    target: string;
    passed: boolean;
    errors: number;
    warnings: number;
    recommended_command: string | null;
    issue_ids: string[];
  } | null;
};

type DashboardChanges = {
  available: boolean;
  error: string | null;
  git_root: string;
  branch: string;
  mode: ChangesReport['mode'];
  since: string | null;
  counts: ChangesReport['counts'];
  groups: ChangesReport['groups'];
  ready_to_commit: boolean;
  blocking_reasons: string[];
  suggested_commit_message: string;
};

type TeamSummary = {
  total_projects: number;
  active_projects: number;
  attention_projects: number;
  by_phase: Record<string, number>;
  by_stack: Record<string, number>;
  recent_projects: RegisteredProject[];
  attention_items: RegisteredProject[];
  delivery_groups: TeamDeliveryGroup[];
  health_layers: TeamHealthLayer[];
  phase_lanes: TeamPhaseLane[];
  next_queue: TeamNextQueueItem[];
  portfolio: TeamPortfolioProject[];
  projects_by_phase: TeamDistributionGroup[];
  projects_by_stack: TeamDistributionGroup[];
};

type TeamDeliveryGroup = {
  id: 'risk' | 'in_progress' | 'waiting' | 'handoff_ready';
  label: string;
  description: string;
  count: number;
  projects: TeamDeliveryProject[];
};

type TeamDeliveryProject = {
  name: string;
  root: string;
  health: HealthSeverity;
  phase: string;
  gate: string;
  task_id: string;
  next_action: string;
  href: string;
};

type TeamHealthLayer = {
  severity: HealthSeverity;
  label: string;
  count: number;
  projects: Array<{ name: string; phase: string; gate: string; next_action: string; href: string }>;
};

type TeamPhaseLane = {
  phase: string;
  count: number;
  projects: Array<{ name: string; gate: string; task_id: string; next_action: string; href: string }>;
};

type TeamNextQueueItem = {
  name: string;
  root: string;
  health: HealthSeverity;
  phase: string;
  gate: string;
  task_id: string;
  task_title: string;
  next_action: string;
  href: string;
};

type TeamPortfolioProject = {
  name: string;
  root: string;
  stack: string;
  phase: string;
  gate: string;
  task_id: string;
  task_title: string;
  health: HealthSeverity;
  next_action: string;
  last_seen_at: string;
  href: string;
};

type TeamDistributionGroup = {
  key: string;
  count: number;
  projects: Array<{ name: string; phase: string; gate: string; root: string; href: string }>;
};

type ProjectDirectoryEntry = RegisteredProject & {
  selected: boolean;
  href: string;
};

type SelectedProjectSummary = {
  status: 'current' | 'registered' | 'missing';
  requested: string | null;
  project: RegisteredProject | null;
  message: string;
};

type WorkspaceSummary = {
  product: string;
  mode: 'read-only';
  navigation: Array<{ id: string; label: string; href: string }>;
};

type ActionCenter = {
  groups: ActionGroup[];
};

type ActionGroup = {
  id: string;
  title: string;
  items: ActionItem[];
};

type ActionItem = {
  id: string;
  label: string;
  command: string;
  description: string;
  href: string | null;
  emphasis: 'primary' | 'normal' | 'attention';
};

type CommandPaletteItem = {
  id: string;
  type: 'view' | 'command' | 'project';
  label: string;
  detail: string;
  href: string | null;
  command: string | null;
};

type HealthSeverity = 'ok' | 'warning' | 'error';

type HealthSignal = {
  id: string;
  label: string;
  severity: HealthSeverity;
  summary: string;
  detail: string;
};

type HealthSummary = {
  status: HealthSeverity;
  ok: number;
  warning: number;
  error: number;
  signals: HealthSignal[];
  attention_queue: HealthSignal[];
};

type TaskDetail = {
  task_id: string;
  title: string;
  phase: string;
  gate: string;
  level: number | null;
  current_step: string;
  next_action: DashboardData['next'];
  progress: {
    total_steps: number;
    done_steps: number;
    remaining_steps: number;
    breadcrumb_entries: number;
    blocked_entries: number;
  };
  steps: Array<{
    id: string;
    title: string;
    done: boolean;
    breadcrumb_status: string | null;
    breadcrumb_context: string | null;
    breadcrumb_time: string | null;
  }>;
  flow_nodes: Array<{
    id: string;
    label: string;
    active: boolean;
    complete: boolean;
    summary: string;
  }>;
  evidence_summary: {
    check: string;
    review: string;
  };
};

type DocumentPreview = {
  id: 'spec' | 'plan' | 'check' | 'review';
  title: string;
  path: string;
  exists: boolean;
  line_count: number;
  summary: string;
  excerpt: string;
};

type HandoffSummary = {
  commands: Array<{ id: string; label: string; command: string; description: string }>;
  required_files: string[];
  recent_breadcrumbs: Array<{ step: string; status: string; timestamp?: string; context: string }>;
  progress: {
    done: number;
    total: number;
    blocked: number;
  };
  evidence: {
    check: string;
    review: string;
  };
  resume_protocol: string[];
};

type OverviewSummary = {
  task: {
    task_id: string;
    task_title: string;
    phase: string;
    gate: string;
    current_step: string;
  };
  next: {
    action: string;
    command: string;
  };
  health_status: HealthSeverity;
  changes_ready: boolean;
  changes_total: number;
  handoff_progress: string;
  backlog_filtered_total: number;
  backlog_total: number;
  project_name: string;
  team_active_projects: number;
  primary_links: Array<{ label: string; href: string; value: string; detail: string }>;
};

type ActivityEvent = {
  id: string;
  type: 'next' | 'breadcrumb' | 'quality' | 'changes' | 'backlog' | 'handoff';
  label: string;
  status: string;
  severity: HealthSeverity;
  time: string | null;
  detail: string;
  href: string | null;
  command: string | null;
};

type ActivitySummary = {
  total: number;
  latest_time: string | null;
  counts: Record<ActivityEvent['type'], number>;
  events: ActivityEvent[];
  focus: ActivityEvent[];
};

type SessionSummary = {
  title: string;
  status: string;
  service: {
    mode: 'read-only';
    endpoint: string;
    api: string;
  };
  task: {
    id: string;
    title: string;
    phase: string;
    gate: string;
    step: string;
  };
  recovery_commands: Array<{ label: string; command: string; detail: string }>;
  required_files: string[];
  evidence: {
    check: string;
    review: string;
  };
  risks: Array<{ label: string; severity: HealthSeverity; detail: string; href: string }>;
  protocol: string[];
};

type ReadinessSignal = {
  id: string;
  label: string;
  status: 'ready' | 'attention' | 'blocked';
  severity: HealthSeverity;
  summary: string;
  detail: string;
  href: string;
  command: string | null;
};

type ReadinessSummary = {
  score: number;
  status: 'ready' | 'attention' | 'blocked';
  ready_to_continue: boolean;
  ready_to_handoff: boolean;
  ready_to_commit: boolean;
  ready_to_archive: boolean;
  blockers: string[];
  signals: ReadinessSignal[];
  next_command: string;
};

type DocsIndexEntry = {
  id: string;
  label: string;
  group: 'task' | 'workspace' | 'runtime' | 'templates';
  path: string;
  exists: boolean;
  detail: string;
  href: string;
};

type DocsIndexSummary = {
  total: number;
  existing: number;
  missing: number;
  groups: Array<{ id: DocsIndexEntry['group']; label: string; count: number; missing: number; entries: DocsIndexEntry[] }>;
  missing_entries: DocsIndexEntry[];
};

type SettingsSummary = {
  service: {
    mode: 'read-only';
    host: string;
    port: number;
    endpoint: string;
    api: string;
  };
  paths: Array<{ id: string; label: string; path: string; exists: boolean }>;
  registry: {
    db_path: string;
    exists: boolean;
    total_projects: number;
  };
  install: ProjectSummary['install_health'];
  data_sources: Array<{ id: string; label: string; path: string; exists: boolean; detail: string }>;
  command_templates: Array<{ id: string; label: string; path: string; exists: boolean; command: string }>;
};

type WorkbenchMapSummary = {
  summary: {
    total_views: number;
    groups: number;
    primary_view: string;
    recommended_next: string;
  };
  groups: WorkbenchMapGroup[];
  recommended_path: Array<{ id: string; label: string; href: string; reason: string }>;
};

type WorkbenchMapGroup = {
  id: string;
  label: string;
  purpose: string;
  views: WorkbenchMapView[];
};

type WorkbenchMapView = {
  id: string;
  label: string;
  href: string;
  role: string;
  status: 'ready' | 'attention' | 'blocked';
  detail: string;
};

type CompletionAuditItem = {
  id: string;
  requirement: string;
  status: 'ready' | 'attention' | 'blocked';
  evidence: Array<{ label: string; href: string; detail: string }>;
  gap: string;
};

type CompletionAuditSummary = {
  score: number;
  status: 'ready' | 'attention' | 'blocked';
  ready: number;
  attention: number;
  blocked: number;
  total: number;
  items: CompletionAuditItem[];
};

export type DashboardData = {
  generated_at: string;
  workspace: WorkspaceSummary;
  overview: OverviewSummary;
  activity: ActivitySummary;
  session: SessionSummary;
  readiness: ReadinessSummary;
  docs_index: DocsIndexSummary;
  settings: SettingsSummary;
  workbench_map: WorkbenchMapSummary;
  completion_audit: CompletionAuditSummary;
  action_center: ActionCenter;
  command_palette: CommandPaletteItem[];
  health: HealthSummary;
  task_detail: TaskDetail;
  document_previews: DocumentPreview[];
  changes: DashboardChanges;
  handoff: HandoffSummary;
  team: TeamSummary;
  project: ProjectSummary;
  current: {
    task_id: string;
    task_title: string;
    phase: string;
    gate: string;
    level: number | null;
    current_step: string;
  };
  next: {
    action: string;
    command: string;
    required_files: string[];
  };
  flow: Array<{ id: string; label: string; active: boolean; complete: boolean }>;
  plan: Array<{ id: string; title: string; done: boolean }>;
  breadcrumb: {
    total: number;
    done: number;
    in_progress: number;
    blocked: number;
    entries: Array<{ step: string; status: string; timestamp?: string; context: string }>;
  };
  evidence: {
    check: EvidenceSummary;
    review: EvidenceSummary;
  };
  backlog: {
    total: number;
    by_status: Record<string, number>;
    filters: {
      status: string | null;
      priority: string | null;
      q: string | null;
    };
    filtered_total: number;
    items: Array<{ id: string; title: string; status: string; priority: string; level: number; task: string | null }>;
    filtered_items: Array<{ id: string; title: string; status: string; priority: string; level: number; task: string | null }>;
    groups: Array<{ status: string; count: number; items: Array<{ id: string; title: string; status: string; priority: string; level: number; task: string | null }> }>;
  };
  registry: {
    total: number;
    projects: RegisteredProject[];
  };
  project_directory: ProjectDirectoryEntry[];
  selected_project: SelectedProjectSummary;
};

const FLOW = [
  { id: 'drafting', label: 'Spec' },
  { id: 'planning', label: 'Plan' },
  { id: 'executing', label: 'Execute' },
  { id: 'checking', label: 'Check' },
  { id: 'reviewing', label: 'Review' },
  { id: 'journaling', label: 'Journal' },
  { id: 'completed', label: 'Done' },
];

const BACKLOG_STATUS_ORDER = new Map([
  ['active', 0],
  ['accepted', 1],
  ['proposed', 2],
  ['planned', 3],
  ['done', 4],
  ['dropped', 5],
]);

const WORKSPACE_NAVIGATION: WorkspaceSummary['navigation'] = [
  { id: 'overview', label: 'Overview', href: '#overview' },
  { id: 'map', label: 'Map', href: '#map' },
  { id: 'session', label: 'Session', href: '#session' },
  { id: 'readiness', label: 'Readiness', href: '#readiness' },
  { id: 'audit', label: 'Audit', href: '#audit' },
  { id: 'docs-index', label: 'Docs Index', href: '#docs-index' },
  { id: 'settings', label: 'Settings', href: '#settings' },
  { id: 'activity', label: 'Activity', href: '#activity' },
  { id: 'team', label: 'Team', href: '#team' },
  { id: 'actions', label: 'Actions', href: '#actions' },
  { id: 'project', label: 'Project', href: '#project' },
  { id: 'task', label: 'Task', href: '#task' },
  { id: 'changes', label: 'Changes', href: '#changes' },
  { id: 'handoff', label: 'Handoff', href: '#handoff' },
  { id: 'documents', label: 'Documents', href: '#documents' },
  { id: 'health', label: 'Health', href: '#health' },
  { id: 'workflow', label: 'Workflow', href: '#workflow' },
  { id: 'evidence', label: 'Evidence', href: '#evidence' },
  { id: 'backlog', label: 'Backlog', href: '#backlog' },
];

const DASHBOARD_CSS = `
    :root {
      --bg: #070a13;
      --panel: rgba(13, 20, 37, 0.7);
      --ink: #f1f5f9;
      --muted: #94a3b8;
      --line: rgba(255, 255, 255, 0.06);
      --accent: #10b981;
      --warn: #f59e0b;
      --bad: #ef4444;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.55 'Plus Jakarta Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    main { width: min(1240px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0 44px; }
    header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
    .appbar { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: rgba(7, 10, 19, 0.95); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); z-index: 2; }
    .brand { font-weight: 800; letter-spacing: 0; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    nav a { color: var(--muted); text-decoration: none; border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; background: rgba(30, 41, 59, 0.2); transition: all 0.2s; }
    nav a:hover, nav a.active { color: #fff; border-color: var(--accent); background: rgba(16, 185, 129, 0.1); }
    .workbench-controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-end; margin-top: 10px; }
    .palette { position: relative; min-width: min(420px, 100%); }
    .palette-input { width: 100%; border: 1px solid var(--line); border-radius: 8px; background: rgba(15, 23, 42, 0.6); color: #fff; min-height: 34px; padding: 6px 10px; }
    .palette-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
    .palette-results { position: absolute; right: 0; top: calc(100% + 6px); width: min(520px, calc(100vw - 32px)); max-height: 340px; overflow: auto; background: #0f172a; border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5); padding: 8px; z-index: 5; display: none; }
    .palette.open .palette-results { display: grid; gap: 6px; }
    .palette-result { border: 1px solid var(--line); border-radius: 8px; background: rgba(30, 41, 59, 0.2); color: var(--ink); text-align: left; padding: 8px; cursor: pointer; display: grid; gap: 2px; }
    .palette-result:hover, .palette-result.active { border-color: var(--accent); background: rgba(16, 185, 129, 0.1); }
    .palette-result small { color: var(--muted); overflow-wrap: anywhere; }
    .icon-button { border: 1px solid var(--line); border-radius: 8px; background: rgba(30, 41, 59, 0.2); color: var(--ink); min-height: 34px; padding: 6px 10px; cursor: pointer; transition: all 0.2s; }
    .icon-button:hover { border-color: var(--accent); background: rgba(16, 185, 129, 0.1); color: #fff; }
    .sync-status { color: var(--muted); font-size: 12px; }
    .search-filter { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin: 10px 0 0; }
    .search-filter input { width: min(360px, 100%); min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; background: rgba(15, 23, 42, 0.6); color: #fff; }
    .search-filter input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15); }
    .search-filter small { color: var(--muted); }
    [data-search-item].search-hidden { display: none !important; }
    [data-search-empty] { display: none; color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 10px; margin-top: 10px; text-align: center; }
    body.search-empty [data-search-empty] { display: block; }
    .js-enabled .view-section { display: none; }
    .js-enabled .view-section.active-view { display: grid; }
    .js-enabled section.panel.view-section.active-view { display: block; }
    h1 { margin: 0; font-size: clamp(28px, 4vw, 44px); line-height: 1.1; letter-spacing: -0.02em; color: #fff; }
    h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: -0.01em; color: #fff; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    p { margin: 0; color: var(--muted); }
    .eyebrow { color: var(--accent); font-weight: 700; margin-bottom: 8px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
    .meta { text-align: right; min-width: 240px; }
    .grid { display: grid; gap: 16px; }
    .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 20px 0; }
    .view-section { scroll-margin-top: 76px; }
    .overview-grid { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); margin: 20px 0; }
    .overview-primary { display: grid; gap: 12px; }
    .overview-command { display: grid; gap: 8px; margin-top: 12px; }
    .overview-links { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .overview-link { color: var(--ink); text-decoration: none; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 4px; min-height: 96px; transition: all 0.2s; }
    .overview-link:hover { border-color: var(--accent); background: rgba(16, 185, 129, 0.1); transform: translateY(-2px); }
    .overview-link span { color: var(--muted); font-size: 12px; }
    .overview-link strong { font-size: 20px; line-height: 1.2; overflow-wrap: anywhere; color: #fff; }
    .overview-link small { color: var(--muted); overflow-wrap: anywhere; }
    .map-grid { grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); margin: 20px 0; }
    .map-groups { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .map-path, .map-view-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .map-path li, .map-view-list li { border: 1px solid var(--line); border-radius: 8px; padding: 9px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 4px; overflow-wrap: anywhere; }
    .map-path a, .map-view-list a { color: var(--accent); font-weight: 700; text-decoration: none; }
    .map-path a:hover, .map-view-list a:hover { text-decoration: underline; color: #34d399; }
    .map-path small, .map-view-list small, .map-view-list p { color: var(--muted); margin: 0; }
    .activity-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); margin: 20px 0; }
    .activity-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .activity-list li { border-left: 3px solid var(--line); border-radius: 8px; padding: 10px 10px 10px 12px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 5px; }
    .activity-list li.ok { border-left-color: var(--accent); }
    .activity-list li.warning { border-left-color: var(--warn); }
    .activity-list li.error { border-left-color: var(--bad); }
    .activity-head { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: baseline; }
    .activity-head a { color: var(--accent); font-weight: 700; text-decoration: none; }
    .activity-head a:hover { text-decoration: underline; color: #34d399; }
    .activity-list time { color: var(--muted); font-size: 12px; }
    .session-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); margin: 20px 0; }
    .session-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
    .session-list li { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); overflow-wrap: anywhere; display: grid; gap: 5px; }
    .session-list li.warning { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .session-list li.error { border-color: var(--bad); background: rgba(239, 68, 68, 0.05); }
    .session-list li.ok { border-color: var(--accent); background: rgba(16, 185, 129, 0.05); }
    .session-list small { color: var(--muted); }
    .session-list a { color: var(--accent); font-weight: 700; text-decoration: none; }
    .session-list a:hover { text-decoration: underline; color: #34d399; }
    .readiness-grid { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); margin: 20px 0; }
    .readiness-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .readiness-list li { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 6px; overflow-wrap: anywhere; }
    .readiness-list li.ok { border-color: var(--accent); background: rgba(16, 185, 129, 0.05); }
    .readiness-list li.warning { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .readiness-list li.error { border-color: var(--bad); background: rgba(239, 68, 68, 0.05); }
    .readiness-list a { color: var(--accent); font-weight: 700; text-decoration: none; }
    .readiness-list a:hover { text-decoration: underline; color: #34d399; }
    .docs-index-grid { grid-template-columns: minmax(0, .75fr) minmax(0, 1.25fr); margin: 20px 0; }
    .docs-index-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .docs-index-group { box-shadow: none; }
    .docs-index-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .docs-index-list li { border: 1px solid var(--line); border-radius: 8px; padding: 9px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 4px; overflow-wrap: anywhere; }
    .docs-index-list li.ok { border-color: var(--accent); }
    .docs-index-list li.warning { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .settings-grid { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); margin: 20px 0; }
    .settings-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .settings-list li { border: 1px solid var(--line); border-radius: 8px; padding: 9px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 4px; overflow-wrap: anywhere; }
    .settings-list li.warning { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .settings-list small, .settings-list p { color: var(--muted); margin: 0; }
    .settings-list code { overflow-wrap: anywhere; }
    .audit-evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; margin: 8px 0; }
    .audit-evidence a { font-weight: 700; color: var(--accent); }
    .audit-evidence small { color: var(--muted); overflow-wrap: anywhere; }
    .project-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); margin: 20px 0; }
    .team-grid { grid-template-columns: minmax(0, .95fr) minmax(0, 1.05fr); margin: 20px 0; }
    .project-title { display: flex; justify-content: space-between; gap: 12px; align-items: start; }
    .project-title strong { display: block; font-size: 24px; line-height: 1.2; overflow-wrap: anywhere; color: #fff; }
    .project-kv { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin-top: 14px; }
    .project-kv dt { color: var(--muted); }
    .project-kv dd { margin: 0; overflow-wrap: anywhere; }
    .status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .status-cell { border: 1px solid var(--line); border-radius: 8px; padding: 10px; min-height: 72px; background: rgba(30, 41, 59, 0.2); }
    .status-cell span { color: var(--muted); font-size: 12px; display: block; }
    .status-cell strong { display: block; font-size: 20px; color: #fff; }
    .actions-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 20px 0; }
    .action-group { display: grid; gap: 10px; }
    .action-card { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 8px; }
    .action-card.primary { border-color: var(--accent); background: rgba(16, 185, 129, 0.05); }
    .action-card.attention { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .action-card header { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; padding: 0; border: 0; }
    .action-card a { color: var(--accent); text-decoration: none; font-weight: 700; }
    .action-card a:hover { text-decoration: underline; color: #34d399; }
    .command-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
    .copy-command { border: 1px solid var(--line); border-radius: 8px; background: rgba(30, 41, 59, 0.4); color: var(--ink); min-height: 30px; padding: 4px 8px; cursor: pointer; transition: all 0.2s; }
    .copy-command:hover { border-color: var(--accent); background: rgba(16, 185, 129, 0.1); color: #fff; }
    .changes-grid { grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); margin: 20px 0; }
    .changes-groups { grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .change-group { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 8px; min-height: 118px; }
    .change-group header { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; padding: 0; border: 0; }
    .change-group ul, .change-blockers { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
    .change-group li, .change-blockers li { color: var(--muted); overflow-wrap: anywhere; }
    .commit-message { display: block; margin-top: 10px; }
    .handoff-grid { grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); margin: 20px 0; }
    .handoff-list, .handoff-commands { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .handoff-list li, .handoff-commands li { border: 1px solid var(--line); border-radius: 8px; padding: 9px; background: rgba(30, 41, 59, 0.2); overflow-wrap: anywhere; }
    .handoff-commands code { display: block; margin-top: 5px; }
    .health-grid { grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr); margin: 20px 0; }
    .health-score { display: grid; gap: 12px; }
    .health-badge { display: inline-flex; align-items: center; justify-content: center; width: fit-content; min-width: 92px; min-height: 42px; border-radius: 8px; padding: 8px 12px; font-weight: 800; }
    .health-badge.ok { color: #d1fae5; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.2); }
    .health-badge.warning { color: #fef3c7; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.2); }
    .health-badge.error { color: #fee2e2; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.2); }
    .signal-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .signal-list li { border: 1px solid var(--line); border-radius: 8px; padding: 10px; display: grid; gap: 4px; background: rgba(30, 41, 59, 0.2); }
    .signal-head { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
    .severity { font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .severity.ok { color: var(--accent); }
    .severity.warning { color: var(--warn); }
    .severity.error { color: var(--bad); }
    .split-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .team-portfolio { grid-column: 1 / -1; }
    .team-portfolio-table a { color: var(--accent); font-weight: 700; text-decoration: none; }
    .team-portfolio-table a:hover { text-decoration: underline; color: #34d399; }
    .team-wide { grid-column: 1 / -1; }
    .team-layers { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .team-layer { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 8px; min-height: 120px; }
    .team-layer header, .team-delivery-group header, .team-queue-item header, .phase-lane header { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; padding: 0; border: 0; }
    .team-layer ul, .team-delivery-group ul, .team-queue, .phase-lane ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .team-layer a, .team-delivery-group a, .team-queue a, .phase-lane a { color: var(--accent); font-weight: 700; text-decoration: none; overflow-wrap: anywhere; }
    .team-layer a:hover, .team-delivery-group a:hover, .team-queue a:hover, .phase-lane a:hover { text-decoration: underline; color: #34d399; }
    .team-layer small, .team-delivery-group small, .team-queue small, .phase-lane small { color: var(--muted); overflow-wrap: anywhere; }
    .team-queue { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .team-delivery { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .team-delivery-group { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 8px; min-height: 160px; }
    .team-delivery-group p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
    .team-delivery-group li { display: grid; gap: 3px; }
    .team-queue-item, .phase-lane { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); display: grid; gap: 6px; }
    .phase-lanes { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .health-dot { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 6px; vertical-align: middle; background: var(--line); }
    .health-dot.ok { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
    .health-dot.warning { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
    .health-dot.error { background: var(--bad); box-shadow: 0 0 8px var(--bad); }
    .distribution-grid { grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .distribution-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .distribution-list li { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); }
    .distribution-list b { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 6px; color: #fff; }
    .distribution-list small { display: block; color: var(--muted); overflow-wrap: anywhere; }
    .mini-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    .mini-list li { border-bottom: 1px solid var(--line); padding-bottom: 8px; }
    .mini-list b { display: block; overflow-wrap: anywhere; color: #fff; }
    .mini-list small { color: var(--muted); overflow-wrap: anywhere; }
    .selected-project { border: 1px solid var(--line); border-radius: 8px; padding: 12px; margin-top: 14px; background: rgba(30, 41, 59, 0.2); }
    .selected-project strong { display: block; overflow-wrap: anywhere; color: #fff; }
    .selected-project small { color: var(--muted); overflow-wrap: anywhere; }
    .project-link { color: var(--accent); font-weight: 700; text-decoration: none; }
    .project-link:hover { text-decoration: underline; color: #34d399; }
    tr.selected-row td { background: rgba(16, 185, 129, 0.08); }
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }
    .filter-bar a, .filter-pill { color: var(--muted); text-decoration: none; border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; background: rgba(30, 41, 59, 0.2); transition: all 0.2s; }
    .filter-bar a.active { color: #fff; border-color: var(--accent); background: rgba(16, 185, 129, 0.1); }
    .board { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .board-column { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: rgba(30, 41, 59, 0.15); min-height: 120px; }
    .board-column h3 { margin: 0 0 10px; font-size: 14px; display: flex; justify-content: space-between; gap: 8px; color: #fff; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
    .backlog-card { border: 1px solid var(--line); border-radius: 8px; padding: 9px; background: rgba(30, 41, 59, 0.3); margin-top: 8px; transition: all 0.2s; }
    .backlog-card:hover { border-color: var(--accent); transform: translateY(-1px); }
    .backlog-card b { display: block; overflow-wrap: anywhere; color: #fff; }
    .backlog-card small { color: var(--muted); overflow-wrap: anywhere; }
    .task-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); margin: 20px 0; }
    .task-flow { display: grid; gap: 8px; }
    .task-node { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: rgba(30, 41, 59, 0.2); }
    .task-node.active { border-color: var(--warn); background: rgba(245, 158, 11, 0.05); }
    .task-node.complete { border-color: var(--accent); background: rgba(16, 185, 129, 0.05); }
    .task-node b { display: block; color: #fff; }
    .task-node small { color: var(--muted); overflow-wrap: anywhere; }
    .documents-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 20px 0; }
    .doc-preview { display: grid; gap: 8px; }
    .doc-preview header { display: block; padding: 0; border: 0; }
    .doc-preview pre { margin: 0; max-height: 260px; overflow: auto; background: #0b0f19; color: #f1f5f9; padding: 12px; border: 1px solid var(--line); border-radius: 8px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: 'JetBrains Mono', monospace; }
    .doc-preview .missing { color: var(--muted); border: 1px dashed var(--line); border-radius: 8px; padding: 12px; text-align: center; }
    .layout { grid-template-columns: minmax(0, 1.15fr) minmax(340px, .85fr); align-items: start; }
    .panel, .metric { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); transition: all 0.3s; }
    .panel:hover, .metric:hover { border-color: rgba(16, 185, 129, 0.2); }
    .panel { padding: 18px; }
    .metric { padding: 15px; min-height: 106px; background: rgba(30, 41, 59, 0.2); display: flex; flex-direction: column; justify-content: space-between; }
    .metric span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
    .metric strong { display: block; font-size: 24px; line-height: 1.2; overflow-wrap: anywhere; color: #fff; font-weight: 800; }
    .metric small { color: var(--muted); margin-top: 4px; display: block; }
    .flow { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; list-style: none; padding: 0; margin: 0; }
    .flow li { border: 1px solid var(--line); border-radius: 8px; padding: 12px 8px; color: var(--muted); text-align: center; min-height: 64px; background: rgba(30, 41, 59, 0.15); }
    .flow span { display: block; width: 12px; height: 12px; border-radius: 50%; background: rgba(255,255,255,0.1); margin: 0 auto 8px; }
    .flow .complete span { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
    .flow .active { border-color: var(--warn); color: #fff; background: rgba(245, 158, 11, 0.05); }
    .flow .active span { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
    .stack { display: grid; gap: 16px; }
    .timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .timeline li { border-left: 3px solid var(--line); padding-left: 12px; }
    .timeline li.done { border-left-color: var(--accent); }
    .timeline li.blocked { border-left-color: var(--bad); }
    .timeline li.in_progress { border-left-color: var(--warn); }
    .timeline b { margin-right: 8px; color: #fff; }
    .timeline time { color: var(--muted); font-size: 12px; }
    .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .steps li { display: grid; grid-template-columns: 24px 1fr; gap: 10px; color: var(--muted); }
    .steps span { width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--line); display: inline-grid; place-items: center; color: #fff; font-size: 12px; background: rgba(30, 41, 59, 0.4); }
    .steps .done { color: var(--ink); }
    .steps .done span { background: var(--accent); border-color: var(--accent); color: #070a13; font-weight: 700; }
    .next { display: grid; gap: 8px; }
    code { background: #0b0f19; color: #34d399; padding: 3px 6px; border: 1px solid var(--line); border-radius: 5px; overflow-wrap: anywhere; font-family: 'JetBrains Mono', monospace; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid var(--line); padding: 9px 6px; text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .evidence { margin: 0; padding-left: 18px; color: var(--muted); }
    @media (max-width: 900px) { main { width: min(100vw - 24px, 720px); } header, .appbar { display: block; } nav { justify-content: flex-start; margin-top: 10px; } .workbench-controls { justify-content: flex-start; } .palette { width: 100%; } .palette-results { left: 0; right: auto; } .meta { text-align: left; margin-top: 12px; min-width: 0; } .metrics, .overview-grid, .overview-links, .map-grid, .map-groups, .session-grid, .readiness-grid, .docs-index-grid, .docs-index-groups, .settings-grid, .activity-grid, .team-grid, .team-layers, .team-delivery, .team-queue, .phase-lanes, .changes-grid, .changes-groups, .handoff-grid, .actions-grid, .distribution-grid, .project-grid, .task-grid, .documents-grid, .health-grid, .layout, .flow, .board, .audit-evidence { grid-template-columns: 1fr; } .status-grid, .split-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 520px) { .status-grid, .split-list { grid-template-columns: 1fr; } .project-kv { grid-template-columns: 1fr; } .team-portfolio-table { display: block; overflow-x: auto; } }
`;

const DASHBOARD_SCRIPT = `
(function () {
  document.documentElement.classList.add('js-enabled');
  var links = Array.prototype.slice.call(document.querySelectorAll('[data-view-link]'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('.view-section'));
  var status = document.querySelector('[data-sync-status]');
  var refresh = document.querySelector('[data-refresh]');
  var palette = document.querySelector('[data-command-palette]');
  var paletteInput = document.querySelector('[data-palette-input]');
  var paletteResults = document.querySelector('[data-palette-results]');
  var searchInput = document.querySelector('[data-search-input]');
  var searchClear = document.querySelector('[data-search-clear]');
  var searchCount = document.querySelector('[data-search-count]');
  var paletteItems = [];
  var paletteMatches = [];
  var paletteActiveIndex = 0;
  var searchQuery = '';
  var knownViews = links.map(function (link) { return link.getAttribute('data-view-link'); }).filter(Boolean);

  var setText = function (field, value) {
    Array.prototype.slice.call(document.querySelectorAll('[data-live-field="' + field + '"]')).forEach(function (node) {
      node.textContent = value == null || value === '' ? '-' : String(value);
    });
  };

  var escapeText = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  var renderActionItem = function (item) {
    var href = item.href ? '<a href="' + escapeText(item.href) + '">打开视图</a>' : '<span></span>';
    return '<article class="action-card ' + escapeText(item.emphasis) + '"><header><b>' + escapeText(item.label) + '</b>' + href + '</header><p>' + escapeText(item.description) + '</p><div class="command-row"><code>' + escapeText(item.command) + '</code><button class="copy-command" type="button" data-copy-command="' + escapeText(item.command) + '">复制</button></div></article>';
  };

  var renderActionGroup = function (group) {
    return '<section class="panel action-group"><h2>' + escapeText(group.title) + '</h2>' + group.items.map(renderActionItem).join('') + '</section>';
  };

  var countInline = function (counts) {
    return Object.keys(counts || {}).map(function (key) { return key + ':' + counts[key]; }).join(' · ') || '暂无';
  };

  var renderProjectMiniItem = function (project) {
    return '<li><b>' + escapeText(project.name) + '</b><small>' + escapeText((project.phase || '-') + ' / ' + (project.gate || '-') + ' · ' + (project.root || '')) + '</small></li>';
  };

  var renderTeamPortfolioRow = function (project) {
    return '<tr><td><a href="' + escapeText(project.href) + '">' + escapeText(project.name) + '</a><small>' + escapeText(project.stack || '-') + '</small></td><td><span class="health-dot ' + escapeText(project.health) + '"></span>' + escapeText(project.health) + '</td><td>' + escapeText(project.phase) + '<small>' + escapeText(project.gate) + '</small></td><td><b>' + escapeText(project.task_id || '-') + '</b><small>' + escapeText(project.task_title || '暂无当前任务') + '</small></td><td>' + escapeText(project.next_action) + '</td><td><small>' + escapeText(project.last_seen_at || '-') + '</small></td></tr>';
  };

  var renderTeamHealthLayer = function (layer) {
    var projects = (layer.projects || []).length > 0
      ? layer.projects.map(function (project) { return '<li><a href="' + escapeText(project.href) + '">' + escapeText(project.name) + '</a><small>' + escapeText((project.phase || '-') + ' / ' + (project.gate || '-') + ' · ' + (project.next_action || '-')) + '</small></li>'; }).join('')
      : '<li><small>暂无项目</small></li>';
    return '<article class="team-layer"><header><b><span class="health-dot ' + escapeText(layer.severity) + '"></span>' + escapeText(layer.label) + '</b><strong>' + escapeText(layer.count) + '</strong></header><ul>' + projects + '</ul></article>';
  };

  var renderTeamNextQueueItem = function (item) {
    return '<article class="team-queue-item"><header><a href="' + escapeText(item.href) + '">' + escapeText(item.name) + '</a><span class="severity ' + escapeText(item.health) + '">' + escapeText(item.health) + '</span></header><b>' + escapeText(item.next_action) + '</b><small>' + escapeText((item.phase || '-') + ' / ' + (item.gate || '-') + ' · ' + (item.task_id || '-') + ' ' + (item.task_title || '')) + '</small></article>';
  };

  var renderTeamDeliveryGroup = function (group) {
    var projects = (group.projects || []).length > 0
      ? group.projects.map(function (project) { return '<li><a href="' + escapeText(project.href) + '">' + escapeText(project.name) + '</a><span class="severity ' + escapeText(project.health) + '">' + escapeText(project.health) + '</span><small>' + escapeText((project.phase || '-') + ' / ' + (project.gate || '-') + ' · ' + (project.task_id || '-') + ' · ' + (project.next_action || '-')) + '</small></li>'; }).join('')
      : '<li><small>暂无项目</small></li>';
    return '<article class="team-delivery-group"><header><b>' + escapeText(group.label) + '</b><strong>' + escapeText(group.count) + '</strong></header><p>' + escapeText(group.description) + '</p><ul>' + projects + '</ul></article>';
  };

  var renderTeamPhaseLane = function (lane) {
    var projects = (lane.projects || []).map(function (project) { return '<li><a href="' + escapeText(project.href) + '">' + escapeText(project.name) + '</a><small>' + escapeText((project.gate || '-') + ' · ' + (project.task_id || '-') + ' · ' + (project.next_action || '-')) + '</small></li>'; }).join('');
    return '<article class="phase-lane"><header><b>' + escapeText(lane.phase) + '</b><strong>' + escapeText(lane.count) + '</strong></header><ul>' + projects + '</ul></article>';
  };

  var renderTeamDistributionItem = function (group) {
    var projects = (group.projects || []).map(function (project) { return project.name + '(' + project.phase + '/' + project.gate + ')'; }).join(' · ');
    return '<li><b><span>' + escapeText(group.key) + '</span><span>' + escapeText(group.count) + '</span></b><small>' + escapeText(projects) + '</small></li>';
  };

  var renderOverviewLink = function (item) {
    return '<a class="overview-link" href="' + escapeText(item.href) + '"><span>' + escapeText(item.label) + '</span><strong>' + escapeText(item.value) + '</strong><small>' + escapeText(item.detail) + '</small></a>';
  };

  var renderMapPathItem = function (item) {
    return '<li><a href="' + escapeText(item.href) + '">' + escapeText(item.label) + '</a><small>' + escapeText(item.reason) + '</small></li>';
  };

  var renderMapViewItem = function (item) {
    return '<li class="' + escapeText(item.status) + '"><div class="signal-head"><a href="' + escapeText(item.href) + '">' + escapeText(item.label) + '</a><span class="severity ' + escapeText(item.status === 'blocked' ? 'error' : item.status === 'attention' ? 'warning' : 'ok') + '">' + escapeText(item.status) + '</span></div><p>' + escapeText(item.role) + '</p><small>' + escapeText(item.detail) + '</small></li>';
  };

  var renderMapGroup = function (group) {
    return '<section class="panel map-group"><h2>' + escapeText(group.label) + '</h2><p>' + escapeText(group.purpose) + '</p><ul class="map-view-list">' + (group.views || []).map(renderMapViewItem).join('') + '</ul></section>';
  };

  var renderActivityEvent = function (event) {
    var link = event.href ? '<a href="' + escapeText(event.href) + '">打开</a>' : '<span></span>';
    var command = event.command ? '<div class="command-row"><code>' + escapeText(event.command) + '</code><button class="copy-command" type="button" data-copy-command="' + escapeText(event.command) + '">复制</button></div>' : '';
    return '<li class="' + escapeText(event.severity) + '"><div class="activity-head"><b>' + escapeText(event.label) + '</b><span class="severity ' + escapeText(event.severity) + '">' + escapeText(event.status) + '</span>' + link + '</div><time>' + escapeText(event.time || '') + '</time><p>' + escapeText(event.detail) + '</p>' + command + '</li>';
  };

  var renderSessionCommand = function (item) {
    return '<li><b>' + escapeText(item.label) + '</b><small>' + escapeText(item.detail) + '</small><div class="command-row"><code>' + escapeText(item.command) + '</code><button class="copy-command" type="button" data-copy-command="' + escapeText(item.command) + '">复制</button></div></li>';
  };

  var renderSessionRisk = function (item) {
    return '<li class="' + escapeText(item.severity) + '"><div class="signal-head"><b>' + escapeText(item.label) + '</b><span class="severity ' + escapeText(item.severity) + '">' + escapeText(item.severity) + '</span></div><p>' + escapeText(item.detail) + '</p><a href="' + escapeText(item.href) + '">打开</a></li>';
  };

  var renderReadinessSignal = function (signal) {
    var command = signal.command ? '<div class="command-row"><code>' + escapeText(signal.command) + '</code><button class="copy-command" type="button" data-copy-command="' + escapeText(signal.command) + '">复制</button></div>' : '';
    return '<li class="' + escapeText(signal.severity) + '"><div class="signal-head"><b>' + escapeText(signal.label) + '</b><span class="severity ' + escapeText(signal.severity) + '">' + escapeText(signal.status) + '</span></div><p>' + escapeText(signal.summary) + '</p><small>' + escapeText(signal.detail) + '</small><a href="' + escapeText(signal.href) + '">打开</a>' + command + '</li>';
  };

  var renderDocsIndexEntry = function (entry) {
    return '<li class="' + (entry.exists ? 'ok' : 'warning') + '"><div class="signal-head"><b>' + escapeText(entry.label) + '</b><span class="severity ' + (entry.exists ? 'ok' : 'warning') + '">' + (entry.exists ? 'exists' : 'missing') + '</span></div><small>' + escapeText(entry.path) + '</small><p>' + escapeText(entry.detail) + '</p></li>';
  };

  var renderDocsIndexGroup = function (group) {
    return '<section class="panel docs-index-group"><h2>' + escapeText(group.label) + ' · ' + escapeText(group.count) + '</h2><ul class="docs-index-list">' + (group.entries || []).map(renderDocsIndexEntry).join('') + '</ul></section>';
  };

  var renderSettingsPathItem = function (item) {
    return '<li class="' + (item.exists ? 'ok' : 'warning') + '"><div class="signal-head"><b>' + escapeText(item.label) + '</b><span class="severity ' + (item.exists ? 'ok' : 'warning') + '">' + (item.exists ? 'exists' : 'missing') + '</span></div><small>' + escapeText(item.path) + '</small></li>';
  };

  var renderSettingsDataSource = function (item) {
    return '<li class="' + (item.exists ? 'ok' : 'warning') + '"><div class="signal-head"><b>' + escapeText(item.label) + '</b><span class="severity ' + (item.exists ? 'ok' : 'warning') + '">' + (item.exists ? 'exists' : 'missing') + '</span></div><small>' + escapeText(item.path) + '</small><p>' + escapeText(item.detail) + '</p></li>';
  };

  var renderSettingsTemplate = function (item) {
    return '<li class="' + (item.exists ? 'ok' : 'warning') + '"><div class="signal-head"><b>' + escapeText(item.label) + '</b><span class="severity ' + (item.exists ? 'ok' : 'warning') + '">' + (item.exists ? 'exists' : 'missing') + '</span></div><small>' + escapeText(item.path) + '</small><div class="command-row"><code>' + escapeText(item.command) + '</code><button class="copy-command" type="button" data-copy-command="' + escapeText(item.command) + '">复制</button></div></li>';
  };

  var renderAuditEvidence = function (evidence) {
    return (evidence || []).map(function (item) { return '<a href="' + escapeText(item.href) + '">' + escapeText(item.label) + '</a><small>' + escapeText(item.detail) + '</small>'; }).join('');
  };

  var renderCompletionAuditItem = function (item) {
    var severity = item.status === 'ready' ? 'ok' : item.status === 'blocked' ? 'error' : 'warning';
    return '<li class="' + escapeText(severity) + '"><div class="signal-head"><b>' + escapeText(item.requirement) + '</b><span class="severity ' + escapeText(severity) + '">' + escapeText(item.status) + '</span></div><div class="audit-evidence">' + renderAuditEvidence(item.evidence) + '</div><p>' + escapeText(item.gap) + '</p></li>';
  };

  var renderChangeGroup = function (key, files) {
    var labels = { source: '源码', tests: '测试', docpath: 'DocPath 运行态', templates_docs: '模板/文档', other: '其他' };
    var rows = (files || []).length > 0
      ? files.slice(0, 8).map(function (file) { return '<li>' + escapeText(file) + '</li>'; }).join('')
      : '<li>暂无变更</li>';
    return '<article class="change-group"><header><b>' + escapeText(labels[key] || key) + '</b><strong>' + escapeText((files || []).length) + '</strong></header><ul>' + rows + '</ul></article>';
  };

  var renderHandoffCommand = function (item) {
    return '<li><b>' + escapeText(item.label) + '</b><small>' + escapeText(item.description) + '</small><code>' + escapeText(item.command) + '</code></li>';
  };

  var loadPaletteItems = function (items) {
    if (items) {
      paletteItems = items;
      return;
    }
    try {
      paletteItems = palette ? JSON.parse(palette.getAttribute('data-palette-items') || '[]') : [];
    } catch (error) {
      paletteItems = [];
    }
  };

  var renderPaletteResults = function () {
    if (!palette || !paletteInput || !paletteResults) return;
    var query = paletteInput.value.trim().toLowerCase();
    paletteMatches = paletteItems.filter(function (item) {
      return !query || [item.type, item.label, item.detail, item.command || ''].join(' ').toLowerCase().indexOf(query) >= 0;
    }).slice(0, 8);
    if (paletteActiveIndex >= paletteMatches.length) paletteActiveIndex = 0;
    palette.classList.toggle('open', paletteInput === document.activeElement && paletteMatches.length > 0);
    paletteResults.innerHTML = paletteMatches.map(function (item, index) {
      return '<button class="palette-result' + (index === paletteActiveIndex ? ' active' : '') + '" type="button" data-palette-index="' + index + '"><b>' + escapeText(item.label) + '</b><small>' + escapeText(item.type + ' · ' + item.detail) + '</small></button>';
    }).join('');
    Array.prototype.slice.call(paletteResults.querySelectorAll('[data-palette-index]')).forEach(function (button) {
      button.addEventListener('click', function () { runPaletteItem(paletteMatches[Number(button.getAttribute('data-palette-index'))]); });
    });
  };

  var movePaletteActive = function (delta) {
    if (paletteMatches.length === 0) return;
    paletteActiveIndex = (paletteActiveIndex + delta + paletteMatches.length) % paletteMatches.length;
    renderPaletteResults();
  };

  var runPaletteItem = function (item) {
    if (!item) return;
    if (item.href) window.location.href = item.href;
    if (item.command) {
      var ghost = document.createElement('button');
      ghost.setAttribute('data-copy-command', item.command);
      copyCommand(ghost);
    }
    if (paletteInput) paletteInput.value = '';
    if (palette) palette.classList.remove('open');
  };

  var selectedView = function () {
    var hash = window.location.hash ? window.location.hash.slice(1) : '';
    return knownViews.indexOf(hash) >= 0 ? hash : 'overview';
  };

  var sectionContainsView = function (section, view) {
    return section.getAttribute('data-view') === view || !!section.querySelector('[data-view="' + view + '"]');
  };

  var activate = function (view) {
    sections.forEach(function (section) {
      section.classList.toggle('active-view', sectionContainsView(section, view));
    });
    links.forEach(function (link) {
      var active = link.getAttribute('data-view-link') === view;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    if (status) status.textContent = '只读数据 · 当前视图 ' + view;
  };

  var bindRefresh = function () {
    if (!refresh) return;
    refresh.addEventListener('click', function () {
      if (status) status.textContent = '只读刷新中...';
      fetch('/api/state')
        .then(function (response) { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
        .then(function (data) {
          syncDashboard(data);
          if (status) status.textContent = '只读数据已刷新 · ' + (data.generated_at || new Date().toISOString());
        })
        .catch(function (error) {
          if (status) status.textContent = '只读刷新失败 · ' + error.message;
        });
    });
  };

  var copyCommand = function (button) {
    var command = button.getAttribute('data-copy-command') || '';
    var done = function () {
      if (status) status.textContent = '已复制只读命令 · ' + command;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(command).then(done).catch(function () {
        if (status) status.textContent = '复制失败，请手动选择命令';
      });
      return;
    }
    if (status) status.textContent = '请手动选择命令 · ' + command;
  };

  var bindCopyCommands = function () {
    Array.prototype.slice.call(document.querySelectorAll('[data-copy-command]')).forEach(function (button) {
      button.addEventListener('click', function () { copyCommand(button); });
    });
  };

  var searchCandidates = function () {
    return Array.prototype.slice.call(document.querySelectorAll('main li, main article, main tr, main .backlog-card, main .doc-preview, main .task-node, main .action-card, main .overview-link'))
      .filter(function (node) { return !node.closest('nav') && !node.closest('[data-search-filter]') && !node.closest('[data-palette-results]'); });
  };

  var indexSearchItems = function () {
    searchCandidates().forEach(function (node) {
      node.setAttribute('data-search-item', '');
      node.setAttribute('data-search-text', (node.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim());
    });
  };

  var applySearchFilter = function () {
    var query = String(searchQuery || '').trim().toLowerCase();
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-search-item]'));
    var matched = 0;
    items.forEach(function (node) {
      var ok = !query || (node.getAttribute('data-search-text') || '').indexOf(query) >= 0;
      node.classList.toggle('search-hidden', !ok);
      if (ok) matched += 1;
    });
    document.body.classList.toggle('search-empty', !!query && matched === 0);
    if (searchCount) searchCount.textContent = query ? ('匹配 ' + matched + ' / ' + items.length + ' 项') : ('显示全部 ' + items.length + ' 项');
  };

  var reapplySearchFilter = function () {
    indexSearchItems();
    applySearchFilter();
  };

  var bindSearchFilter = function () {
    if (!searchInput) return;
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value || '';
      applySearchFilter();
    });
    if (searchClear) {
      searchClear.addEventListener('click', function () {
        searchQuery = '';
        searchInput.value = '';
        applySearchFilter();
        searchInput.focus();
      });
    }
    reapplySearchFilter();
  };

  var syncDashboard = function (data) {
    setText('generated_at', data.generated_at);
    setText('task_title', data.current && data.current.task_title);
    setText('phase', data.current && data.current.phase);
    setText('gate', data.current && data.current.gate);
    setText('current_step', data.current && data.current.current_step);
    setText('next_command', data.next && data.next.command);
    setText('health_status', data.health && String(data.health.status).toUpperCase());
    setText('health_ok', data.health && data.health.ok);
    setText('health_warning', data.health && data.health.warning);
    setText('health_error', data.health && data.health.error);
    setText('backlog_total', data.backlog && data.backlog.total);
    setText('backlog_filtered_total', data.backlog && data.backlog.filtered_total);
    var actionRoot = document.querySelector('[data-action-center]');
    if (actionRoot && data.action_center) {
      actionRoot.innerHTML = data.action_center.groups.map(renderActionGroup).join('');
      bindCopyCommands();
    }
    if (data.command_palette) loadPaletteItems(data.command_palette);
    syncOverview(data.overview);
    syncWorkbenchMap(data.workbench_map);
    syncSession(data.session);
    syncReadiness(data.readiness);
    syncCompletionAudit(data.completion_audit);
    syncDocsIndex(data.docs_index);
    syncSettings(data.settings);
    syncActivity(data.activity);
    syncTeam(data.team);
    syncChanges(data.changes);
    syncHandoff(data.handoff);
    reapplySearchFilter();
  };

  var setTeamHtml = function (name, html) {
    var node = document.querySelector('[data-team-' + name + ']');
    if (node) node.innerHTML = html;
  };

  var syncOverview = function (overview) {
    if (!overview) return;
    setText('overview_task', overview.task && overview.task.current_step);
    setText('overview_project', overview.project_name);
    setText('overview_health', overview.health_status && String(overview.health_status).toUpperCase());
    setText('overview_changes', overview.changes_ready ? 'READY' : 'BLOCKED');
    setText('overview_changes_total', overview.changes_total);
    setText('overview_handoff', overview.handoff_progress);
    setText('overview_backlog', overview.backlog_filtered_total + '/' + overview.backlog_total);
    setText('overview_team_active', overview.team_active_projects);
    setText('overview_next_action', overview.next && overview.next.action);
    setText('overview_next_command', overview.next && overview.next.command);
    Array.prototype.slice.call(document.querySelectorAll('[data-overview-next-copy]')).forEach(function (button) {
      button.setAttribute('data-copy-command', overview.next && overview.next.command ? overview.next.command : '');
    });
    setTeamHtml('overview-links', (overview.primary_links || []).map(renderOverviewLink).join(''));
  };

  var syncWorkbenchMap = function (map) {
    if (!map) return;
    setText('map_total_views', map.summary && map.summary.total_views);
    setText('map_group_count', map.summary && map.summary.groups);
    setText('map_primary_view', map.summary && map.summary.primary_view);
    setText('map_recommended_next', map.summary && map.summary.recommended_next);
    setTeamHtml('map-path', (map.recommended_path || []).map(renderMapPathItem).join(''));
    setTeamHtml('map-groups', (map.groups || []).map(renderMapGroup).join(''));
  };

  var syncActivity = function (activity) {
    if (!activity) return;
    setText('activity_total', activity.total);
    setText('activity_latest_time', activity.latest_time || '-');
    setText('activity_focus_total', (activity.focus || []).length);
    setText('activity_breadcrumb_count', activity.counts && activity.counts.breadcrumb);
    setText('activity_quality_count', activity.counts && activity.counts.quality);
    setTeamHtml('activity-events', (activity.events || []).map(renderActivityEvent).join(''));
    setTeamHtml('activity-focus', (activity.focus || []).length > 0 ? activity.focus.map(renderActivityEvent).join('') : '<li class="ok"><b>暂无关注事件</b><p>当前活动流没有 warning/error 事件。</p></li>');
    bindCopyCommands();
  };

  var syncSession = function (session) {
    if (!session) return;
    setText('session_status', session.status);
    setText('session_task', session.task && session.task.title);
    setText('session_step', session.task && session.task.step);
    setText('session_endpoint', session.service && session.service.endpoint);
    setText('session_api', session.service && session.service.api);
    setText('session_check', session.evidence && session.evidence.check);
    setText('session_review', session.evidence && session.evidence.review);
    setText('session_file_count', (session.required_files || []).length);
    setText('session_risk_count', (session.risks || []).length);
    setTeamHtml('session-commands', (session.recovery_commands || []).map(renderSessionCommand).join(''));
    setTeamHtml('session-files', (session.required_files || []).map(function (file) { return '<li>' + escapeText(file) + '</li>'; }).join(''));
    setTeamHtml('session-risks', (session.risks || []).length > 0 ? session.risks.map(renderSessionRisk).join('') : '<li class="ok"><b>暂无风险</b><p>当前恢复视角没有关注项。</p></li>');
    setTeamHtml('session-protocol', (session.protocol || []).map(function (item) { return '<li>' + escapeText(item) + '</li>'; }).join(''));
    bindCopyCommands();
  };

  var syncReadiness = function (readiness) {
    if (!readiness) return;
    setText('readiness_score', readiness.score + '%');
    setText('readiness_status', readiness.status);
    setText('readiness_continue', readiness.ready_to_continue ? 'YES' : 'NO');
    setText('readiness_handoff', readiness.ready_to_handoff ? 'YES' : 'NO');
    setText('readiness_commit', readiness.ready_to_commit ? 'YES' : 'NO');
    setText('readiness_archive', readiness.ready_to_archive ? 'YES' : 'NO');
    setText('readiness_blocker_count', (readiness.blockers || []).length);
    setText('readiness_next_command', readiness.next_command);
    setTeamHtml('readiness-signals', (readiness.signals || []).map(renderReadinessSignal).join(''));
    setTeamHtml('readiness-blockers', (readiness.blockers || []).length > 0 ? readiness.blockers.map(function (item) { return '<li class="error">' + escapeText(item) + '</li>'; }).join('') : '<li class="ok">暂无阻塞项</li>');
    bindCopyCommands();
  };

  var syncCompletionAudit = function (audit) {
    if (!audit) return;
    setText('audit_score', audit.score + '%');
    setText('audit_status', audit.status);
    setText('audit_ready', audit.ready + '/' + audit.total);
    setText('audit_attention', audit.attention);
    setText('audit_blocked', audit.blocked);
    setTeamHtml('completion-audit-items', (audit.items || []).map(renderCompletionAuditItem).join(''));
  };

  var syncDocsIndex = function (docsIndex) {
    if (!docsIndex) return;
    setText('docs_index_total', docsIndex.total);
    setText('docs_index_existing', docsIndex.existing);
    setText('docs_index_missing', docsIndex.missing);
    setTeamHtml('docs-index-groups', (docsIndex.groups || []).map(renderDocsIndexGroup).join(''));
    setTeamHtml('docs-index-missing', (docsIndex.missing_entries || []).length > 0 ? docsIndex.missing_entries.map(renderDocsIndexEntry).join('') : '<li class="ok"><b>暂无缺失项</b><p>当前索引文件均存在。</p></li>');
  };

  var syncSettings = function (settings) {
    if (!settings) return;
    setText('settings_endpoint', settings.service && settings.service.endpoint);
    setText('settings_api', settings.service && settings.service.api);
    setText('settings_mode', settings.service && settings.service.mode);
    setText('settings_registry_total', settings.registry && settings.registry.total_projects);
    setText('settings_registry_path', settings.registry && settings.registry.db_path);
    setText('settings_registry_exists', settings.registry && (settings.registry.exists ? 'exists' : 'missing'));
    setText('settings_install_target', settings.install && settings.install.target);
    setText('settings_install_status', settings.install ? (settings.install.passed ? 'PASS' : 'ATTENTION') : 'UNKNOWN');
    setText('settings_install_issues', settings.install ? ((settings.install.errors || 0) + ' 错误 · ' + (settings.install.warnings || 0) + ' 警告') : '-');
    setTeamHtml('settings-paths', (settings.paths || []).map(renderSettingsPathItem).join(''));
    setTeamHtml('settings-data-sources', (settings.data_sources || []).map(renderSettingsDataSource).join(''));
    setTeamHtml('settings-command-templates', (settings.command_templates || []).map(renderSettingsTemplate).join(''));
    bindCopyCommands();
  };

  var syncTeam = function (team) {
    if (!team) return;
    setText('team_total_projects', team.total_projects);
    setText('team_active_projects', team.active_projects);
    setText('team_attention_projects', team.attention_projects);
    setText('team_phase_count', Object.keys(team.by_phase || {}).length);
    setText('team_phase_inline', countInline(team.by_phase));
    setText('team_stack_count', Object.keys(team.by_stack || {}).length);
    setText('team_stack_inline', countInline(team.by_stack));
    setTeamHtml('recent-projects', (team.recent_projects || []).length > 0 ? team.recent_projects.map(renderProjectMiniItem).join('') : '<li><b>暂无</b><small>没有匹配项目</small></li>');
    setTeamHtml('attention-items', (team.attention_items || []).length > 0 ? team.attention_items.map(renderProjectMiniItem).join('') : '<li><b>暂无</b><small>没有匹配项目</small></li>');
    setTeamHtml('portfolio', (team.portfolio || []).length > 0 ? team.portfolio.map(renderTeamPortfolioRow).join('') : '<tr><td colspan="6">暂无注册项目</td></tr>');
    setTeamHtml('health-layers', (team.health_layers || []).map(renderTeamHealthLayer).join(''));
    setTeamHtml('delivery-groups', (team.delivery_groups || []).length > 0 ? team.delivery_groups.map(renderTeamDeliveryGroup).join('') : '<article class="team-delivery-group"><header><b>暂无</b><strong>0</strong></header><p>没有可展示项目</p><ul><li><small>暂无项目</small></li></ul></article>');
    setTeamHtml('next-queue', (team.next_queue || []).length > 0 ? team.next_queue.map(renderTeamNextQueueItem).join('') : '<article class="team-queue-item"><b>暂无</b><small>没有已注册项目</small></article>');
    setTeamHtml('phase-lanes', (team.phase_lanes || []).length > 0 ? team.phase_lanes.map(renderTeamPhaseLane).join('') : '<article class="phase-lane"><header><b>暂无</b><strong>0</strong></header><small>没有可展示项目</small></article>');
    setTeamHtml('phase-distribution', (team.projects_by_phase || []).length > 0 ? team.projects_by_phase.map(renderTeamDistributionItem).join('') : '<li><b><span>暂无</span><span>0</span></b><small>没有可展示项目</small></li>');
    setTeamHtml('stack-distribution', (team.projects_by_stack || []).length > 0 ? team.projects_by_stack.map(renderTeamDistributionItem).join('') : '<li><b><span>暂无</span><span>0</span></b><small>没有可展示项目</small></li>');
  };

  var syncChanges = function (changes) {
    if (!changes) return;
    setText('changes_available', changes.available ? '可用' : '不可用');
    setText('changes_ready', changes.ready_to_commit ? 'READY' : 'BLOCKED');
    setText('changes_total', changes.counts && changes.counts.total);
    setText('changes_staged', changes.counts && changes.counts.staged);
    setText('changes_unstaged', changes.counts && changes.counts.unstaged);
    setText('changes_untracked', changes.counts && changes.counts.untracked);
    setText('changes_branch', changes.branch);
    setText('changes_commit_message', changes.suggested_commit_message || '-');
    setText('changes_error', changes.error || '');
    setTeamHtml('changes-blockers', (changes.blocking_reasons || []).length > 0 ? changes.blocking_reasons.map(function (reason) { return '<li>' + escapeText(reason) + '</li>'; }).join('') : '<li>没有阻塞项</li>');
    setTeamHtml('changes-groups', ['source', 'tests', 'docpath', 'templates_docs', 'other'].map(function (key) { return renderChangeGroup(key, (changes.groups || {})[key] || []); }).join(''));
  };

  var syncHandoff = function (handoff) {
    if (!handoff) return;
    setText('handoff_progress', (handoff.progress ? handoff.progress.done : 0) + '/' + (handoff.progress ? handoff.progress.total : 0));
    setText('handoff_blocked', handoff.progress && handoff.progress.blocked);
    setText('handoff_check', handoff.evidence && handoff.evidence.check);
    setText('handoff_review', handoff.evidence && handoff.evidence.review);
    setTeamHtml('handoff-commands', (handoff.commands || []).map(renderHandoffCommand).join(''));
    setTeamHtml('handoff-files', (handoff.required_files || []).map(function (file) { return '<li>' + escapeText(file) + '</li>'; }).join('') || '<li>.docpath/workspace/current.md</li>');
    setTeamHtml('handoff-breadcrumbs', (handoff.recent_breadcrumbs || []).map(function (entry) { return '<li><b>' + escapeText(entry.step) + '</b><small>' + escapeText((entry.status || '-') + ' · ' + (entry.context || '')) + '</small></li>'; }).join('') || '<li>暂无 breadcrumb</li>');
    setTeamHtml('handoff-protocol', (handoff.resume_protocol || []).map(function (item) { return '<li>' + escapeText(item) + '</li>'; }).join(''));
  };

  var bindPalette = function () {
    loadPaletteItems();
    if (!paletteInput) return;
    paletteInput.addEventListener('input', function () { paletteActiveIndex = 0; renderPaletteResults(); });
    paletteInput.addEventListener('focus', renderPaletteResults);
    paletteInput.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePaletteActive(1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePaletteActive(-1);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        runPaletteItem(paletteMatches[paletteActiveIndex]);
      }
      if (event.key === 'Escape' && palette) palette.classList.remove('open');
    });
    document.addEventListener('click', function (event) {
      if (palette && !palette.contains(event.target)) palette.classList.remove('open');
    });
  };

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && paletteInput) {
      event.preventDefault();
      paletteInput.focus();
      paletteInput.select();
      renderPaletteResults();
    }
  });

  window.addEventListener('hashchange', function () { activate(selectedView()); });
  links.forEach(function (link) {
    link.addEventListener('click', function () { setTimeout(function () { activate(selectedView()); }, 0); });
  });
  bindRefresh();
  bindCopyCommands();
  bindSearchFilter();
  bindPalette();
  activate(selectedView());
}());`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function summarizeEvidence(raw: string, fallback: string): EvidenceSummary {
  const result = raw.match(/^\*\*结果\*\*:\s*(.+)$/m)?.[1]?.trim()
    || raw.match(/审查通过.+$/m)?.[0]?.trim()
    || (raw.trim() ? '已记录证据' : fallback);
  const time = raw.match(/^\*\*时间\*\*:\s*(.+)$/m)?.[1]?.trim() || null;
  const items = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^-\s+[✅❌⚠️]/.test(line))
    .slice(0, 12);
  return { time, result, items, raw };
}

function summarizeDocument(content: string): string {
  const firstHeading = content.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (firstHeading) return firstHeading;
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine || '暂无内容';
}

async function buildDocumentPreview(id: DocumentPreview['id'], title: string, path: string): Promise<DocumentPreview> {
  const content = await readOptionalFile(path);
  const exists = content.trim().length > 0;
  const lines = exists ? content.split('\n') : [];
  return {
    id,
    title,
    path,
    exists,
    line_count: lines.length,
    summary: exists ? summarizeDocument(content) : '文件不存在或为空',
    excerpt: exists ? lines.slice(0, 12).join('\n').slice(0, 1200) : '',
  };
}

async function buildDocumentPreviews(docpathDir: string): Promise<DocumentPreview[]> {
  return Promise.all([
    buildDocumentPreview('spec', 'Spec', join(docpathDir, 'tasks', 'current', 'spec.md')),
    buildDocumentPreview('plan', 'Plan', join(docpathDir, 'tasks', 'current', 'plan.md')),
    buildDocumentPreview('check', 'Check Evidence', join(docpathDir, 'workspace', 'last-check.md')),
    buildDocumentPreview('review', 'Review Evidence', join(docpathDir, 'workspace', 'review.md')),
  ]);
}

function buildFlow(phase: string, gate: string): DashboardData['flow'] {
  const currentIndex = Math.max(0, FLOW.findIndex((item) => item.id === phase));
  return FLOW.map((item, index) => ({
    ...item,
    active: item.id === phase,
    complete: phase === 'completed' || index < currentIndex || (item.id === 'checking' && gate === 'check_pass') || (item.id === 'reviewing' && gate === 'review_pass'),
  }));
}

function readProjectField(config: unknown, key: string): string {
  if (!config || typeof config !== 'object') return '';
  const project = (config as { project?: unknown }).project;
  if (!project || typeof project !== 'object') return '';
  const value = (project as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

async function readProjectConfig(docpathDir: string): Promise<unknown> {
  try {
    return parseYaml(await readFile(join(docpathDir, 'config.yaml'), 'utf-8'));
  } catch {
    return null;
  }
}

async function countTaskDirectories(docpathDir: string): Promise<number> {
  try {
    const entries = await readdir(join(docpathDir, 'tasks'), { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && entry.name !== 'current').length;
  } catch {
    return 0;
  }
}

async function readInstallTarget(docpathDir: string): Promise<string> {
  const metaRaw = await readOptionalFile(join(docpathDir, '.install-meta.json'));
  try {
    const meta = metaRaw ? JSON.parse(metaRaw) as { target?: unknown } : null;
    return isInstallTarget(meta?.target) ? meta.target : 'universal';
  } catch {
    return 'universal';
  }
}

function normalizeLessonKeyPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractLearnedLessonKeys(content: string): Set<string> {
  const keys = new Set<string>();
  const regex = /^<!--\s+docpath:lesson-meta\s+(.+?)\s+-->$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) != null) {
    keys.add(normalizeLessonKeyPart(match[1]));
  }
  return keys;
}

function extractCandidateLessonKeys(content: string): string[] {
  const blocks = content.split(/^##\s+/m).filter((block) => block.trim());
  const keys: string[] = [];
  for (const block of blocks) {
    const keyword = block.match(/^- key:\s*(.+)$/m)?.[1]?.trim();
    if (!keyword || !/^###\s+Lesson\s*$/m.test(block)) continue;
    const taskId = block.match(/^- task_id:\s*(.+)$/m)?.[1]?.trim() || '';
    const typeValue = block.match(/^- type:\s*(.+)$/m)?.[1]?.trim() || 'best-practice';
    const targetValue = block.match(/^- target:\s*(.+)$/m)?.[1]?.trim() || 'style';
    const source = block.match(/^- source:\s*(.+)$/m)?.[1]?.trim() || 'lesson-candidates';
    const type = targetValue === 'architecture' || typeValue === 'architecture' ? 'architecture' : typeValue;
    const target = targetValue === 'architecture' || type === 'architecture' ? 'architecture' : 'style';
    keys.push(normalizeLessonKeyPart([type, target, keyword, source, taskId].join(':').slice(0, 180)));
  }
  return keys;
}

async function readRuleContent(docpathDir: string, name: 'style' | 'architecture'): Promise<string> {
  const modern = await readOptionalFile(join(docpathDir, 'rules', `${name}.md`));
  if (modern.trim()) return modern;
  return readOptionalFile(join(docpathDir, 'spec', `${name}.md`));
}

async function countPendingLessonCandidates(docpathDir: string): Promise<number> {
  const candidates = extractCandidateLessonKeys(await readOptionalFile(join(docpathDir, 'workspace', 'lesson-candidates.md')));
  if (candidates.length === 0) return 0;
  const learned = new Set([
    ...extractLearnedLessonKeys(await readRuleContent(docpathDir, 'style')),
    ...extractLearnedLessonKeys(await readRuleContent(docpathDir, 'architecture')),
  ]);
  return candidates.filter((key) => !learned.has(key)).length;
}

async function summarizeInstallHealth(cwd: string, docpathDir: string): Promise<ProjectSummary['install_health']> {
  try {
    const report = await buildInstallDoctorReport({ cwd, target: await readInstallTarget(docpathDir) });
    return {
      target: report.target,
      passed: report.passed,
      errors: report.errors,
      warnings: report.warnings,
      recommended_command: report.recommended_command,
      issue_ids: report.issues.map((issue) => issue.id),
    };
  } catch {
    return null;
  }
}

async function summarizeProject(args: {
  cwd: string;
  docpathDir: string;
  backlog: Awaited<ReturnType<typeof listBacklogItems>>;
  backlogSummary: DashboardData['backlog'];
}): Promise<ProjectSummary> {
  const config = await readProjectConfig(args.docpathDir);
  const fallbackName = args.cwd.split(/[\\/]/).filter(Boolean).at(-1) || 'docpath project';

  return {
    name: readProjectField(config, 'name') || fallbackName,
    type: readProjectField(config, 'type') || '-',
    language: readProjectField(config, 'language') || '-',
    framework: readProjectField(config, 'framework') || '-',
    root: args.cwd,
    docpath_dir: args.docpathDir,
    task_dirs: await countTaskDirectories(args.docpathDir),
    backlog_total: args.backlog.length,
    backlog_by_status: { ...args.backlogSummary.by_status },
    lesson_pending_count: await countPendingLessonCandidates(args.docpathDir),
    install_health: await summarizeInstallHealth(args.cwd, args.docpathDir),
  };
}

function incrementCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

function projectStack(project: RegisteredProject): string {
  return [project.type, project.language, project.framework]
    .filter((item) => item && item !== '-')
    .join(' / ') || '-';
}

function projectHref(project: RegisteredProject): string {
  return `/?root=${encodeURIComponent(project.root)}#project`;
}

function projectHealth(project: RegisteredProject): HealthSeverity {
  if (project.gate.endsWith('_fail')) return 'error';
  return ['completed', 'idle'].includes(project.phase) ? 'ok' : 'warning';
}

function projectNextAction(project: RegisteredProject): string {
  if (project.gate.endsWith('_fail')) return '处理失败门禁';
  if (project.phase === 'drafting') return '生成执行计划';
  if (['planning', 'executing'].includes(project.phase)) return project.task_id ? `推进 ${project.task_id}` : '推进当前任务';
  if (project.phase === 'checking') return '运行 check';
  if (project.phase === 'reviewing') return '运行 review';
  if (project.phase === 'completed') return '选择下一个 backlog';
  return '查看 next 路由';
}

function healthRank(severity: HealthSeverity): number {
  if (severity === 'error') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function compareProjectsForTeam(a: RegisteredProject, b: RegisteredProject): number {
  const healthDelta = healthRank(projectHealth(a)) - healthRank(projectHealth(b));
  if (healthDelta !== 0) return healthDelta;
  const seenDelta = (Date.parse(b.last_seen_at || '') || 0) - (Date.parse(a.last_seen_at || '') || 0);
  if (seenDelta !== 0) return seenDelta;
  return a.name.localeCompare(b.name);
}

function toTeamPortfolioProject(project: RegisteredProject): TeamPortfolioProject {
  return {
    name: project.name,
    root: project.root,
    stack: projectStack(project),
    phase: project.phase || 'unknown',
    gate: project.gate || 'none',
    task_id: project.task_id,
    task_title: project.task_title,
    health: projectHealth(project),
    next_action: projectNextAction(project),
    last_seen_at: project.last_seen_at,
    href: projectHref(project),
  };
}

function buildTeamDistribution(projects: RegisteredProject[], groupBy: (project: RegisteredProject) => string): TeamDistributionGroup[] {
  const groups = new Map<string, RegisteredProject[]>();
  for (const project of projects) {
    const key = groupBy(project) || 'unknown';
    const group = groups.get(key) || [];
    group.push(project);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([aKey, aProjects], [bKey, bProjects]) => bProjects.length - aProjects.length || aKey.localeCompare(bKey))
    .map(([key, groupProjects]) => ({
      key,
      count: groupProjects.length,
      projects: groupProjects.slice(0, 6).map((project) => ({
        name: project.name,
        phase: project.phase || 'unknown',
        gate: project.gate || 'none',
        root: project.root,
        href: projectHref(project),
      })),
    }));
}

function buildTeamHealthLayers(projects: RegisteredProject[]): TeamHealthLayer[] {
  const labels: Record<HealthSeverity, string> = {
    error: '阻塞',
    warning: '推进中',
    ok: '稳定',
  };
  return (['error', 'warning', 'ok'] as HealthSeverity[]).map((severity) => {
    const group = projects.filter((project) => projectHealth(project) === severity).sort(compareProjectsForTeam);
    return {
      severity,
      label: labels[severity],
      count: group.length,
      projects: group.slice(0, 5).map((project) => ({
        name: project.name,
        phase: project.phase || 'unknown',
        gate: project.gate || 'none',
        next_action: projectNextAction(project),
        href: projectHref(project),
      })),
    };
  });
}

function buildTeamPhaseLanes(projects: RegisteredProject[]): TeamPhaseLane[] {
  return buildTeamDistribution(projects, (project) => project.phase || 'unknown').map((group) => ({
    phase: group.key,
    count: group.count,
    projects: projects
      .filter((project) => (project.phase || 'unknown') === group.key)
      .sort(compareProjectsForTeam)
      .slice(0, 6)
      .map((project) => ({
        name: project.name,
        gate: project.gate || 'none',
        task_id: project.task_id,
        next_action: projectNextAction(project),
        href: projectHref(project),
      })),
  }));
}

function buildTeamNextQueue(projects: RegisteredProject[]): TeamNextQueueItem[] {
  return [...projects]
    .sort(compareProjectsForTeam)
    .slice(0, 8)
    .map((project) => ({
      name: project.name,
      root: project.root,
      health: projectHealth(project),
      phase: project.phase || 'unknown',
      gate: project.gate || 'none',
      task_id: project.task_id,
      task_title: project.task_title,
      next_action: projectNextAction(project),
      href: projectHref(project),
    }));
}

function toTeamDeliveryProject(project: RegisteredProject): TeamDeliveryProject {
  return {
    name: project.name,
    root: project.root,
    health: projectHealth(project),
    phase: project.phase || 'unknown',
    gate: project.gate || 'none',
    task_id: project.task_id,
    next_action: projectNextAction(project),
    href: projectHref(project),
  };
}

function buildTeamDeliveryGroups(projects: RegisteredProject[]): TeamDeliveryGroup[] {
  const sorted = [...projects].sort(compareProjectsForTeam);
  const definitions: Array<Omit<TeamDeliveryGroup, 'count' | 'projects'> & { filter: (project: RegisteredProject) => boolean }> = [
    {
      id: 'risk',
      label: '风险优先',
      description: '门禁失败、安装异常或需要人工关注的项目',
      filter: (project) => projectHealth(project) === 'error' || project.gate.endsWith('_fail'),
    },
    {
      id: 'in_progress',
      label: '执行中',
      description: '处在 planning/executing/checking/reviewing 的项目',
      filter: (project) => ['planning', 'executing', 'checking', 'reviewing'].includes(project.phase || ''),
    },
    {
      id: 'waiting',
      label: '待推进',
      description: '空闲、已完成或需要选择下一项工作的项目',
      filter: (project) => ['idle', 'completed'].includes(project.phase || ''),
    },
    {
      id: 'handoff_ready',
      label: '可交接',
      description: '已完成、已 review 通过或证据链稳定的项目',
      filter: (project) => project.phase === 'completed' || project.gate === 'review_pass' || project.gate === 'check_pass',
    },
  ];

  return definitions.map((definition) => {
    const groupProjects = sorted.filter(definition.filter);
    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      count: groupProjects.length,
      projects: groupProjects.slice(0, 6).map(toTeamDeliveryProject),
    };
  });
}

function matchesProjectQuery(project: RegisteredProject, query: string): boolean {
  return project.name === query || project.root === query || project.task_id === query;
}

function resolveSelectedProject(args: {
  cwd: string;
  projects: RegisteredProject[];
  selection: ProjectSelection;
}): SelectedProjectSummary {
  const requested = args.selection.root || args.selection.project || null;
  if (!requested) {
    const current = args.projects.find((project) => project.root === args.cwd) || null;
    return {
      status: 'current',
      requested: null,
      project: current,
      message: current ? '显示当前工作目录项目' : '当前工作目录尚未注册，显示本地项目视图',
    };
  }
  const selected = args.selection.root
    ? args.projects.find((project) => project.root === args.selection.root)
    : args.projects.find((project) => matchesProjectQuery(project, requested));
  return selected
    ? { status: 'registered', requested, project: selected, message: '显示已注册项目只读详情' }
    : { status: 'missing', requested, project: null, message: '未找到匹配的已注册项目，仍显示当前项目视图' };
}

function buildProjectDirectory(projects: RegisteredProject[], selected: SelectedProjectSummary, cwd: string): ProjectDirectoryEntry[] {
  return projects.map((project) => ({
    ...project,
    selected: selected.project ? project.root === selected.project.root : selected.status === 'current' && project.root === cwd,
    href: projectHref(project),
  }));
}

function summarizeTeam(projects: RegisteredProject[]): TeamSummary {
  const byPhase: Record<string, number> = {};
  const byStack: Record<string, number> = {};
  const attentionItems = projects.filter((project) => !['completed', 'idle'].includes(project.phase) || project.gate.endsWith('_fail'));
  for (const project of projects) {
    incrementCount(byPhase, project.phase || 'unknown');
    incrementCount(byStack, projectStack(project));
  }
  return {
    total_projects: projects.length,
    active_projects: projects.filter((project) => !['completed', 'idle'].includes(project.phase)).length,
    attention_projects: attentionItems.length,
    by_phase: byPhase,
    by_stack: byStack,
    recent_projects: projects.slice(0, 5),
    attention_items: attentionItems.slice(0, 5),
    delivery_groups: buildTeamDeliveryGroups(projects),
    health_layers: buildTeamHealthLayers(projects),
    phase_lanes: buildTeamPhaseLanes(projects),
    next_queue: buildTeamNextQueue(projects),
    portfolio: projects.map(toTeamPortfolioProject),
    projects_by_phase: buildTeamDistribution(projects, (project) => project.phase || 'unknown'),
    projects_by_stack: buildTeamDistribution(projects, projectStack),
  };
}

function buildOverviewSummary(args: {
  current: DashboardData['current'];
  next: DashboardData['next'];
  health: HealthSummary;
  changes: DashboardChanges;
  handoff: HandoffSummary;
  backlog: DashboardData['backlog'];
  project: ProjectSummary;
  team: TeamSummary;
}): OverviewSummary {
  const handoffProgress = `${args.handoff.progress.done}/${args.handoff.progress.total}`;
  return {
    task: {
      task_id: args.current.task_id,
      task_title: args.current.task_title,
      phase: args.current.phase,
      gate: args.current.gate,
      current_step: args.current.current_step,
    },
    next: {
      action: args.next.action,
      command: args.next.command,
    },
    health_status: args.health.status,
    changes_ready: args.changes.ready_to_commit,
    changes_total: args.changes.counts.total,
    handoff_progress: handoffProgress,
    backlog_filtered_total: args.backlog.filtered_total,
    backlog_total: args.backlog.total,
    project_name: args.project.name,
    team_active_projects: args.team.active_projects,
    primary_links: [
      { label: '当前任务', href: '#task', value: args.current.current_step || '-', detail: args.current.task_id || '暂无任务 ID' },
      { label: '健康队列', href: '#health', value: args.health.status.toUpperCase(), detail: `${args.health.warning} 关注 · ${args.health.error} 阻塞` },
      { label: '变更收口', href: '#changes', value: args.changes.ready_to_commit ? 'READY' : 'BLOCKED', detail: `${args.changes.counts.total} 个文件变更` },
      { label: '交接准备', href: '#handoff', value: handoffProgress, detail: args.handoff.evidence.check },
      { label: 'Backlog', href: '#backlog', value: `${args.backlog.filtered_total}/${args.backlog.total}`, detail: '当前筛选 / 全部事项' },
      { label: 'Team', href: '#team', value: `${args.team.active_projects}/${args.team.total_projects}`, detail: '活跃项目 / 注册项目' },
    ],
  };
}

function incrementActivityCount(counts: ActivitySummary['counts'], type: ActivityEvent['type']): void {
  counts[type] = (counts[type] || 0) + 1;
}

function buildActivitySummary(args: {
  next: DashboardData['next'];
  breadcrumb: DashboardData['breadcrumb'];
  evidence: DashboardData['evidence'];
  changes: DashboardChanges;
  backlog: DashboardData['backlog'];
  handoff: HandoffSummary;
}): ActivitySummary {
  const events: ActivityEvent[] = [];
  events.push({
    id: 'next-action',
    type: 'next',
    label: '推荐下一步',
    status: 'ready',
    severity: 'warning',
    time: null,
    detail: args.next.action,
    href: '#actions',
    command: args.next.command,
  });
  for (const [index, entry] of args.breadcrumb.entries.slice(-8).reverse().entries()) {
    events.push({
      id: `breadcrumb-${index}-${entry.step}`,
      type: 'breadcrumb',
      label: `Breadcrumb · ${entry.step}`,
      status: entry.status,
      severity: entry.status === 'blocked' ? 'error' : entry.status === 'in_progress' ? 'warning' : 'ok',
      time: entry.timestamp || null,
      detail: entry.context || entry.status,
      href: '#evidence',
      command: null,
    });
  }
  events.push({
    id: 'quality-check',
    type: 'quality',
    label: 'Check 证据',
    status: args.evidence.check.result,
    severity: isEvidencePassing(args.evidence.check) ? 'ok' : 'warning',
    time: args.evidence.check.time,
    detail: args.evidence.check.items.slice(0, 3).join(' · ') || '暂无 check 条目',
    href: '#health',
    command: 'docpath check',
  });
  events.push({
    id: 'quality-review',
    type: 'quality',
    label: 'Review 证据',
    status: args.evidence.review.result,
    severity: isEvidencePassing(args.evidence.review) ? 'ok' : 'warning',
    time: args.evidence.review.time,
    detail: args.evidence.review.items.slice(0, 3).join(' · ') || '暂无 review 条目',
    href: '#health',
    command: 'docpath review',
  });
  events.push({
    id: 'changes-summary',
    type: 'changes',
    label: '变更收口',
    status: args.changes.ready_to_commit ? 'ready' : 'blocked',
    severity: args.changes.ready_to_commit ? 'ok' : 'warning',
    time: null,
    detail: args.changes.available ? `${args.changes.counts.total} 个文件变更 · ${args.changes.branch}` : args.changes.error || 'changes 不可用',
    href: '#changes',
    command: 'docpath changes',
  });
  events.push({
    id: 'backlog-summary',
    type: 'backlog',
    label: 'Backlog 队列',
    status: `${args.backlog.filtered_total}/${args.backlog.total}`,
    severity: args.backlog.filtered_total > 0 ? 'warning' : 'ok',
    time: null,
    detail: Object.entries(args.backlog.by_status).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无 backlog',
    href: '#backlog',
    command: 'docpath backlog list',
  });
  events.push({
    id: 'handoff-summary',
    type: 'handoff',
    label: '交接准备',
    status: `${args.handoff.progress.done}/${args.handoff.progress.total}`,
    severity: args.handoff.progress.blocked > 0 ? 'error' : 'ok',
    time: null,
    detail: `${args.handoff.required_files.length} 个必读文件 · check ${args.handoff.evidence.check} · review ${args.handoff.evidence.review}`,
    href: '#handoff',
    command: 'docpath agent handoff',
  });
  const counts: ActivitySummary['counts'] = { next: 0, breadcrumb: 0, quality: 0, changes: 0, backlog: 0, handoff: 0 };
  for (const event of events) incrementActivityCount(counts, event.type);
  const latestTime = events.map((event) => event.time).filter((time): time is string => Boolean(time)).sort().at(-1) || null;
  return {
    total: events.length,
    latest_time: latestTime,
    counts,
    events,
    focus: events.filter((event) => event.severity !== 'ok').slice(0, 6),
  };
}

function buildSessionSummary(args: {
  current: DashboardData['current'];
  next: DashboardData['next'];
  health: HealthSummary;
  changes: DashboardChanges;
  handoff: HandoffSummary;
  activity: ActivitySummary;
  project: ProjectSummary;
}): SessionSummary {
  const risks: SessionSummary['risks'] = args.health.attention_queue.map((signal) => ({
    label: signal.label,
    severity: signal.severity,
    detail: signal.detail,
    href: '#health',
  }));
  if (!args.changes.ready_to_commit) {
    risks.push({
      label: 'Changes',
      severity: 'warning',
      detail: args.changes.blocking_reasons.join(' · ') || `${args.changes.counts.total} 个文件变更待确认`,
      href: '#changes',
    });
  }
  return {
    title: 'Session Recovery',
    status: `${args.current.phase} / ${args.current.gate}`,
    service: {
      mode: 'read-only',
      endpoint: `http://${DEFAULT_DASHBOARD_HOST}:${DEFAULT_DASHBOARD_PORT}`,
      api: DASHBOARD_API_PATH,
    },
    task: {
      id: args.current.task_id,
      title: args.current.task_title,
      phase: args.current.phase,
      gate: args.current.gate,
      step: args.current.current_step,
    },
    recovery_commands: [
      { label: '查看路由', command: 'docpath next --agent', detail: '重新确认下一步推荐动作' },
      { label: '刷新工作台', command: 'docpath dashboard', detail: '启动或重开本地只读页面' },
      { label: '生成交接包', command: 'docpath agent handoff', detail: '需要切换会话时再手动执行' },
      { label: '上下文摘要', command: 'docpath context --max-tokens 8000', detail: '生成可复制给 agent 的恢复上下文' },
    ],
    required_files: args.handoff.required_files,
    evidence: {
      check: args.handoff.evidence.check,
      review: args.handoff.evidence.review,
    },
    risks: risks.slice(0, 8),
    protocol: [
      '先看 Overview，确认当前任务和 next 命令',
      '打开 Activity，理解最近发生的工作流事件',
      '检查 Session 的必读文件和风险提示',
      '只复制命令到终端执行，页面自身不修改状态',
      `最近活动时间: ${args.activity.latest_time || '暂无'}`,
      `项目: ${args.project.name}`,
    ],
  };
}

function pathStatus(id: string, label: string, path: string): SettingsSummary['paths'][number] {
  return { id, label, path, exists: existsSync(path) };
}

function buildSettingsSummary(args: {
  cwd: string;
  docpathDir: string;
  project: ProjectSummary;
  registryTotal: number;
}): SettingsSummary {
  const registryDbPath = resolveProjectRegistryDbPath();
  const templatePaths = [
    { id: 'dashboard', label: 'Dashboard command', command: 'docpath dashboard', path: join(args.cwd, 'templates/commands/docpath-dashboard.md') },
    { id: 'projects', label: 'Projects command', command: 'docpath projects', path: join(args.cwd, 'templates/commands/docpath-projects.md') },
  ];
  const dataSourcePaths = [
    { id: 'state', label: '当前状态', path: join(args.docpathDir, 'workspace/state.json'), detail: '任务 phase/gate/current step' },
    { id: 'current', label: 'Current 文档', path: join(args.docpathDir, 'workspace/current.md'), detail: '工作区可读状态摘要' },
    { id: 'breadcrumb', label: 'Breadcrumb', path: join(args.docpathDir, 'workspace/breadcrumb.md'), detail: '最近步骤和恢复线索' },
    { id: 'backlog', label: 'Backlog', path: join(args.docpathDir, 'backlog'), detail: '需求和队列数据' },
    { id: 'registry', label: 'Project Registry', path: registryDbPath, detail: 'SQLite 项目注册中心' },
  ];
  return {
    service: {
      mode: 'read-only',
      host: DEFAULT_DASHBOARD_HOST,
      port: DEFAULT_DASHBOARD_PORT,
      endpoint: `http://${DEFAULT_DASHBOARD_HOST}:${DEFAULT_DASHBOARD_PORT}`,
      api: DASHBOARD_API_PATH,
    },
    paths: [
      pathStatus('project-root', '项目根目录', args.project.root),
      pathStatus('docpath-dir', 'DocPath 目录', args.project.docpath_dir),
      pathStatus('config', '项目配置', join(args.docpathDir, 'config.yaml')),
      pathStatus('rules', '规则目录', join(args.docpathDir, 'rules')),
    ],
    registry: {
      db_path: registryDbPath,
      exists: existsSync(registryDbPath),
      total_projects: args.registryTotal,
    },
    install: args.project.install_health,
    data_sources: dataSourcePaths.map((source) => ({ ...source, exists: existsSync(source.path) })),
    command_templates: templatePaths.map((template) => ({ ...template, exists: existsSync(template.path) })),
  };
}

function mapStatus(severity: HealthSeverity): WorkbenchMapView['status'] {
  if (severity === 'error') return 'blocked';
  if (severity === 'warning') return 'attention';
  return 'ready';
}

function buildWorkbenchMap(args: {
  navigation: WorkspaceSummary['navigation'];
  current: DashboardData['current'];
  next: DashboardData['next'];
  health: HealthSummary;
  readiness: ReadinessSummary;
  changes: DashboardChanges;
  handoff: HandoffSummary;
  team: TeamSummary;
  project: ProjectSummary;
  settings: SettingsSummary;
  docsIndex: DocsIndexSummary;
}): WorkbenchMapSummary {
  const view = (id: string, role: string, status: WorkbenchMapView['status'], detail: string): WorkbenchMapView => {
    const item = args.navigation.find((entry) => entry.id === id) || { id, label: id, href: `#${id}` };
    return { id: item.id, label: item.label, href: item.href, role, status, detail };
  };
  const groups: WorkbenchMapGroup[] = [
    {
      id: 'start',
      label: '开始与恢复',
      purpose: '进入工作台、恢复上下文并确认下一步',
      views: [
        view('overview', '工作台首页', 'ready', `${args.current.phase} / ${args.current.gate}`),
        view('map', '视图地图', 'ready', `${args.navigation.length} 个视图`),
        view('session', '会话恢复', args.handoff.progress.blocked > 0 ? 'blocked' : 'ready', `${args.handoff.progress.done}/${args.handoff.progress.total}`),
        view('activity', '最近活动', args.health.warning + args.health.error > 0 ? 'attention' : 'ready', `${args.health.warning + args.health.error} 个关注信号`),
      ],
    },
    {
      id: 'execute',
      label: '执行推进',
      purpose: '查看任务、流程和可复制的下一步命令',
      views: [
        view('task', '当前任务', args.current.phase === 'completed' ? 'ready' : 'attention', args.current.current_step),
        view('workflow', '流程图', 'ready', args.current.phase),
        view('actions', '动作中心', 'ready', args.next.command),
        view('backlog', '需求队列', args.project.backlog_total > 0 ? 'ready' : 'attention', `${args.project.backlog_total} 个事项`),
      ],
    },
    {
      id: 'quality',
      label: '质量收口',
      purpose: '确认 check/review/changes/handoff 是否能收口',
      views: [
        view('readiness', '收口审计', args.readiness.status === 'blocked' ? 'blocked' : args.readiness.status, `${args.readiness.score}%`),
        view('audit', '完成度审计', args.readiness.status === 'blocked' ? 'blocked' : args.readiness.status, '要求到证据的只读映射'),
        view('health', '健康队列', mapStatus(args.health.status), `${args.health.error} 阻塞 · ${args.health.warning} 关注`),
        view('changes', '变更收口', args.changes.ready_to_commit ? 'ready' : 'attention', `${args.changes.counts.total} 个文件`),
        view('handoff', '交接包', args.readiness.ready_to_handoff ? 'ready' : 'blocked', `${args.handoff.progress.done}/${args.handoff.progress.total}`),
      ],
    },
    {
      id: 'project-team',
      label: '项目与团队',
      purpose: '查看当前项目、注册项目和跨项目工作状态',
      views: [
        view('project', '项目层级', 'ready', args.project.name),
        view('team', '团队视角', args.team.attention_projects > 0 ? 'attention' : 'ready', `${args.team.active_projects}/${args.team.total_projects}`),
      ],
    },
    {
      id: 'knowledge-config',
      label: '知识与配置',
      purpose: '定位文档、证据、数据源和运行配置',
      views: [
        view('docs-index', '文档索引', args.docsIndex.missing > 0 ? 'attention' : 'ready', `${args.docsIndex.existing}/${args.docsIndex.total}`),
        view('documents', '文档预览', 'ready', 'spec / plan / check / review'),
        view('evidence', '证据链', args.health.status === 'error' ? 'blocked' : 'ready', args.current.gate),
        view('settings', '运行配置', args.settings.install?.passed === false ? 'attention' : 'ready', args.settings.service.endpoint),
      ],
    },
  ];
  const recommendedPath = [
    { id: 'overview', label: 'Overview', href: '#overview', reason: '先确认当前任务和 next 命令' },
    { id: 'map', label: 'Map', href: '#map', reason: '选择进入哪个工作域' },
    { id: args.readiness.ready_to_continue ? 'actions' : 'readiness', label: args.readiness.ready_to_continue ? 'Actions' : 'Readiness', href: args.readiness.ready_to_continue ? '#actions' : '#readiness', reason: args.readiness.ready_to_continue ? '复制下一步命令推进' : '先处理收口阻塞' },
    { id: 'handoff', label: 'Handoff', href: '#handoff', reason: '需要切换会话时生成恢复上下文' },
  ];
  return {
    summary: {
      total_views: args.navigation.length,
      groups: groups.length,
      primary_view: 'overview',
      recommended_next: args.next.command,
    },
    groups,
    recommended_path: recommendedPath,
  };
}

function buildCompletionAudit(args: {
  workspace: WorkspaceSummary;
  current: DashboardData['current'];
  next: DashboardData['next'];
  flow: DashboardData['flow'];
  plan: DashboardData['plan'];
  breadcrumb: DashboardData['breadcrumb'];
  evidence: DashboardData['evidence'];
  backlog: DashboardData['backlog'];
  overview: OverviewSummary;
  session: SessionSummary;
  readiness: ReadinessSummary;
  docsIndex: DocsIndexSummary;
  settings: SettingsSummary;
  workbenchMap: WorkbenchMapSummary;
  actionCenter: ActionCenter;
  commandPalette: CommandPaletteItem[];
  team: TeamSummary;
  project: ProjectSummary;
  registeredProjects: RegisteredProject[];
  projectDirectory: ProjectDirectoryEntry[];
  selectedProject: SelectedProjectSummary;
}): CompletionAuditSummary {
  const item = (
    id: string,
    requirement: string,
    ok: boolean,
    evidence: CompletionAuditItem['evidence'],
    gap: string,
    blocked = false,
  ): CompletionAuditItem => ({
    id,
    requirement,
    status: ok ? 'ready' : blocked ? 'blocked' : 'attention',
    evidence,
    gap: ok ? '已由当前只读数据证明' : gap,
  });
  const hasView = (id: string) => args.workspace.navigation.some((entry) => entry.id === id && entry.href === `#${id}`);
  const hasCommand = (command: string) => args.commandPalette.some((entry) => entry.command === command);
  const hasTemplateCommand = (command: string) => args.settings.command_templates.some((entry) => entry.command === command);
  const items: CompletionAuditItem[] = [
    item('local-readonly', '作为本地页面运行，第一版保持只读', args.workspace.mode === 'read-only' && !!args.settings.service.endpoint, [
      { label: 'Settings', href: '#settings', detail: args.settings.service.endpoint },
      { label: 'Session', href: '#session', detail: args.session.service.mode },
    ], '需要确认 service endpoint 与 read-only mode 均可见'),
    item('current-task', '展示当前任务与下一步', !!args.current.task_id && hasView('task'), [
      { label: 'Task', href: '#task', detail: `${args.current.task_id} · ${args.current.current_step}` },
      { label: 'Actions', href: '#actions', detail: args.next.command },
    ], '缺少当前任务或 Task 视图'),
    item('workflow-data', '展示流程图、计划与 breadcrumb', args.flow.length > 0 && args.plan.length > 0 && args.breadcrumb.total > 0, [
      { label: 'Workflow', href: '#workflow', detail: `${args.current.phase} / ${args.current.gate}` },
      { label: 'Handoff', href: '#handoff', detail: `${args.breadcrumb.done}/${args.breadcrumb.total} breadcrumb` },
    ], '流程、计划或 breadcrumb 证据不足'),
    item('check-review', '展示 check/review 证据', !!args.evidence.check.result && !!args.evidence.review.result && hasView('evidence'), [
      { label: 'Evidence', href: '#evidence', detail: `check: ${args.evidence.check.result}; review: ${args.evidence.review.result}` },
      { label: 'Readiness', href: '#readiness', detail: args.readiness.status },
    ], '缺少 check/review 结果'),
    item('backlog', '展示 backlog 队列', hasView('backlog') && args.backlog.total >= 0, [
      { label: 'Backlog', href: '#backlog', detail: `${args.backlog.filtered_total}/${args.backlog.total} 项` },
    ], '缺少 backlog 数据层或视图'),
    item('agent-workbench', '先做 Agent 工作台而不是团队项目看板', hasView('overview') && hasView('map') && hasView('actions') && args.actionCenter.groups.length > 0, [
      { label: 'Overview', href: '#overview', detail: args.overview.next.command },
      { label: 'Map', href: '#map', detail: `${args.workbenchMap.summary.groups} 个工作域` },
      { label: 'Actions', href: '#actions', detail: `${args.actionCenter.groups.length} 组只读命令` },
    ], 'Agent 工作台入口或命令中心不完整'),
    item('project-level', 'Dashboard 具备项目层级', hasView('project') && args.projectDirectory.length >= 0 && ['current', 'registered'].includes(args.selectedProject.status), [
      { label: 'Project', href: '#project', detail: args.project.name },
      { label: 'Settings', href: '#settings', detail: args.settings.registry.db_path },
    ], '项目摘要、目录或选中项目信息不足'),
    item('team-view', 'Dashboard 具备 team 视角', hasView('team') && Array.isArray(args.team.portfolio) && Array.isArray(args.team.delivery_groups), [
      { label: 'Team', href: '#team', detail: `${args.team.active_projects}/${args.team.total_projects} 活跃项目` },
      { label: 'Map', href: '#map', detail: '项目与团队工作域' },
    ], 'team portfolio 或交付分组未生成'),
    item('sqlite-registry', '使用 SQLite registry 展示不同项目', args.settings.registry.exists && args.settings.registry.total_projects === args.registeredProjects.length, [
      { label: 'Settings', href: '#settings', detail: args.settings.registry.db_path },
      { label: 'Team', href: '#team', detail: `${args.registeredProjects.length} 个注册项目` },
    ], 'SQLite registry 不存在或项目数不一致'),
    item('session-recovery', '支持 session recovery 和 handoff', hasView('session') && hasView('handoff') && args.session.recovery_commands.some((entry) => entry.command === 'docpath agent handoff'), [
      { label: 'Session', href: '#session', detail: `${args.session.required_files.length} 个恢复文件` },
      { label: 'Handoff', href: '#handoff', detail: args.session.recovery_commands.map((entry) => entry.command).join(' · ') },
    ], '缺少 session/handoff 恢复证据'),
    item('readiness-audit', '展示 readiness 收口状态', hasView('readiness') && args.readiness.score >= 0, [
      { label: 'Readiness', href: '#readiness', detail: `${args.readiness.score}% · ${args.readiness.status}` },
    ], '缺少 readiness 数据层'),
    item('docs-settings-map-search', '具备文档索引、运行配置、工作台地图和搜索过滤', hasView('docs-index') && hasView('settings') && hasView('map') && (hasCommand('docpath dashboard') || hasTemplateCommand('docpath dashboard')), [
      { label: 'Docs Index', href: '#docs-index', detail: `${args.docsIndex.existing}/${args.docsIndex.total}` },
      { label: 'Settings', href: '#settings', detail: args.settings.service.api },
      { label: 'Map', href: '#map', detail: `${args.workbenchMap.summary.total_views} 个视图` },
    ], '缺少 docs/settings/map 或命令 palette 证据'),
  ];
  const ready = items.filter((entry) => entry.status === 'ready').length;
  const blocked = items.filter((entry) => entry.status === 'blocked').length;
  const attention = items.filter((entry) => entry.status === 'attention').length;
  return {
    score: items.length === 0 ? 0 : Math.round((ready / items.length) * 100),
    status: blocked > 0 ? 'blocked' : attention > 0 ? 'attention' : 'ready',
    ready,
    attention,
    blocked,
    total: items.length,
    items,
  };
}

function readinessStatus(severity: HealthSeverity): ReadinessSignal['status'] {
  return severity === 'error' ? 'blocked' : severity === 'warning' ? 'attention' : 'ready';
}

function buildReadinessSummary(args: {
  current: DashboardData['current'];
  next: DashboardData['next'];
  health: HealthSummary;
  changes: DashboardChanges;
  handoff: HandoffSummary;
  backlog: DashboardData['backlog'];
  project: ProjectSummary;
  evidence: DashboardData['evidence'];
}): ReadinessSummary {
  const activeBacklog = args.backlog.items.filter((item) => ['active', 'accepted', 'proposed', 'planned'].includes(item.status)).length;
  const install = args.project.install_health;
  const checkReady = isEvidencePassing(args.evidence.check);
  const reviewReady = isEvidencePassing(args.evidence.review);
  const workflowSeverity: HealthSeverity = args.current.phase === 'completed' && args.current.gate === 'review_pass' ? 'ok' : args.current.gate.endsWith('_fail') ? 'error' : 'warning';
  const signals: ReadinessSignal[] = [
    {
      id: 'workflow',
      label: 'Workflow',
      severity: workflowSeverity,
      status: readinessStatus(workflowSeverity),
      summary: workflowSeverity === 'ok' ? '流程已收口' : '流程仍需推进',
      detail: `${args.current.phase} / ${args.current.gate} · ${args.current.current_step}`,
      href: '#workflow',
      command: args.next.command,
    },
    {
      id: 'check',
      label: 'Check',
      severity: checkReady ? 'ok' : 'warning',
      status: checkReady ? 'ready' : 'attention',
      summary: checkReady ? '质量检查通过' : '质量检查证据待确认',
      detail: args.evidence.check.result,
      href: '#health',
      command: 'docpath check',
    },
    {
      id: 'review',
      label: 'Review',
      severity: reviewReady ? 'ok' : 'warning',
      status: reviewReady ? 'ready' : 'attention',
      summary: reviewReady ? '代码审查通过' : '代码审查证据待确认',
      detail: args.evidence.review.result,
      href: '#health',
      command: 'docpath review',
    },
    {
      id: 'changes',
      label: 'Changes',
      severity: args.changes.ready_to_commit ? 'ok' : 'warning',
      status: args.changes.ready_to_commit ? 'ready' : 'attention',
      summary: args.changes.ready_to_commit ? '变更可提交' : '变更仍需确认',
      detail: args.changes.blocking_reasons.join(' · ') || `${args.changes.counts.total} 个文件变更`,
      href: '#changes',
      command: 'docpath changes',
    },
    {
      id: 'handoff',
      label: 'Handoff',
      severity: args.handoff.progress.blocked > 0 ? 'error' : 'ok',
      status: args.handoff.progress.blocked > 0 ? 'blocked' : 'ready',
      summary: args.handoff.progress.blocked > 0 ? '交接存在阻塞' : '交接信息可用',
      detail: `${args.handoff.progress.done}/${args.handoff.progress.total} · ${args.handoff.required_files.length} 个必读文件`,
      href: '#handoff',
      command: 'docpath agent handoff',
    },
    {
      id: 'backlog',
      label: 'Backlog',
      severity: activeBacklog > 0 ? 'warning' : 'ok',
      status: activeBacklog > 0 ? 'attention' : 'ready',
      summary: activeBacklog > 0 ? '仍有待处理需求' : '当前无待处理需求',
      detail: Object.entries(args.backlog.by_status).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无 backlog',
      href: '#backlog',
      command: 'docpath backlog list',
    },
    {
      id: 'install',
      label: 'Install',
      severity: install == null || install.passed ? 'ok' : 'warning',
      status: install == null || install.passed ? 'ready' : 'attention',
      summary: install == null ? '未发现安装健康报告' : install.passed ? '安装健康通过' : '安装健康需处理',
      detail: install == null ? '暂无 install health' : `${install.errors} 错误 · ${install.warnings} 警告${install.recommended_command ? ` · ${install.recommended_command}` : ''}`,
      href: '#health',
      command: install?.recommended_command || null,
    },
    {
      id: 'lesson',
      label: 'Lesson',
      severity: args.project.lesson_pending_count > 0 ? 'warning' : 'ok',
      status: args.project.lesson_pending_count > 0 ? 'attention' : 'ready',
      summary: args.project.lesson_pending_count > 0 ? '存在待固化经验' : '无待固化经验',
      detail: `${args.project.lesson_pending_count} 条 lesson 候选`,
      href: '#health',
      command: args.project.lesson_pending_count > 0 ? 'docpath learn --dry-run' : null,
    },
  ];
  const blockers = signals.filter((signal) => signal.status === 'blocked').map((signal) => `${signal.label}: ${signal.detail}`);
  const attention = signals.filter((signal) => signal.status === 'attention').length;
  const ready = signals.filter((signal) => signal.status === 'ready').length;
  const score = Math.round((ready / signals.length) * 100);
  return {
    score,
    status: blockers.length > 0 ? 'blocked' : attention > 0 ? 'attention' : 'ready',
    ready_to_continue: blockers.length === 0,
    ready_to_handoff: args.handoff.progress.blocked === 0 && args.handoff.required_files.length > 0,
    ready_to_commit: args.changes.ready_to_commit,
    ready_to_archive: args.current.phase === 'completed' && args.current.gate === 'review_pass' && checkReady,
    blockers,
    signals,
    next_command: args.next.command,
  };
}

function toDocsIndexEntry(entry: Omit<DocsIndexEntry, 'exists' | 'href'>): DocsIndexEntry {
  const exists = existsSync(entry.path);
  return {
    ...entry,
    exists,
    href: exists ? `file:${entry.path}` : '#docs-index',
  };
}

function buildDocsIndex(args: {
  docpathDir: string;
  documentPreviews: DocumentPreview[];
  handoff: HandoffSummary;
  next: DashboardData['next'];
}): DocsIndexSummary {
  const taskEntries = args.documentPreviews.map((preview): DocsIndexEntry => ({
    id: `task-${preview.id}`,
    label: preview.title,
    group: 'task',
    path: preview.path,
    exists: preview.exists,
    detail: `${preview.summary} · ${preview.line_count} 行`,
    href: preview.exists ? `file:${preview.path}` : '#docs-index',
  }));
  const workspaceFiles: Array<[string, string, string]> = [
    ['current', 'Current State', 'workspace/current.md'],
    ['breadcrumb', 'Breadcrumb', 'workspace/breadcrumb.md'],
    ['last-check', 'Last Check', 'workspace/last-check.md'],
    ['review', 'Review Evidence', 'workspace/review.md'],
    ['decisions', 'Decisions', 'workspace/decisions.md'],
    ['state', 'State JSON', 'workspace/state.json'],
  ];
  const runtimeFiles = [...new Set([...args.next.required_files, ...args.handoff.required_files])]
    .map((file, index) => toDocsIndexEntry({
      id: `runtime-${index}`,
      label: file.split('/').at(-1) || file,
      group: 'runtime',
      path: file.startsWith('/') ? file : join(args.docpathDir, '..', file),
      detail: '恢复或下一步命令依赖文件',
    }));
  const entries: DocsIndexEntry[] = [
    ...taskEntries,
    ...workspaceFiles.map(([id, label, relative]) => toDocsIndexEntry({
      id: `workspace-${id}`,
      label,
      group: 'workspace',
      path: join(args.docpathDir, relative.replace(/^workspace\//, 'workspace/')),
      detail: '工作区运行态证据',
    })),
    ...runtimeFiles,
    ...[
      toDocsIndexEntry({ id: 'template-dashboard', label: 'docpath-dashboard command', group: 'templates', path: join(args.docpathDir, '..', 'templates/commands/docpath-dashboard.md'), detail: 'Dashboard 命令模板' }),
      toDocsIndexEntry({ id: 'template-projects', label: 'docpath-projects command', group: 'templates', path: join(args.docpathDir, '..', 'templates/commands/docpath-projects.md'), detail: 'Projects 命令模板' }),
    ],
  ];
  const labels: Record<DocsIndexEntry['group'], string> = {
    task: '任务文档',
    workspace: 'Workspace 证据',
    runtime: '恢复依赖',
    templates: '命令模板',
  };
  const groups = (['task', 'workspace', 'runtime', 'templates'] as DocsIndexEntry['group'][]).map((id) => {
    const groupEntries = entries.filter((entry) => entry.group === id);
    return { id, label: labels[id], count: groupEntries.length, missing: groupEntries.filter((entry) => !entry.exists).length, entries: groupEntries };
  });
  return {
    total: entries.length,
    existing: entries.filter((entry) => entry.exists).length,
    missing: entries.filter((entry) => !entry.exists).length,
    groups,
    missing_entries: entries.filter((entry) => !entry.exists),
  };
}

function isEvidencePassing(evidence: EvidenceSummary): boolean {
  return /PASS|通过/.test(evidence.result) && !/FAIL|失败/.test(evidence.result);
}

function emptyChangeGroups(): ChangesReport['groups'] {
  return { source: [], tests: [], docpath: [], templates_docs: [], other: [] };
}

async function summarizeChanges(cwd: string): Promise<DashboardChanges> {
  try {
    const report = await buildChangesReport(cwd);
    return { available: true, error: null, ...report };
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : String(error),
      git_root: '',
      branch: 'unknown',
      mode: 'worktree',
      since: null,
      counts: { total: 0, staged: 0, unstaged: 0, untracked: 0 },
      groups: emptyChangeGroups(),
      ready_to_commit: false,
      blocking_reasons: ['当前目录不是 git 仓库，无法生成变更收口视图'],
      suggested_commit_message: '',
    };
  }
}

function summarizeHealth(args: {
  phase: string;
  gate: string;
  breadcrumb: DashboardData['breadcrumb'];
  check: EvidenceSummary;
  review: EvidenceSummary;
  project: ProjectSummary;
  backlog: DashboardData['backlog'];
}): HealthSummary {
  const activeBacklog = args.backlog.items.filter((item) => ['active', 'accepted', 'proposed', 'planned'].includes(item.status)).length;
  const checkPassed = isEvidencePassing(args.check);
  const reviewPassed = isEvidencePassing(args.review);
  const install = args.project.install_health;
  const signals: HealthSignal[] = [
    {
      id: 'workflow',
      label: 'Workflow',
      severity: args.gate.endsWith('_fail') || args.breadcrumb.blocked > 0 ? 'error' : args.phase === 'completed' ? 'ok' : 'warning',
      summary: args.phase === 'completed' ? '流程已完成' : `当前处于 ${args.phase}`,
      detail: args.breadcrumb.blocked > 0 ? `${args.breadcrumb.blocked} 条阻塞记录` : `gate: ${args.gate}`,
    },
    {
      id: 'check',
      label: 'Check',
      severity: checkPassed ? 'ok' : 'warning',
      summary: checkPassed ? '质量检查已通过' : '质量检查证据待确认',
      detail: args.check.result,
    },
    {
      id: 'review',
      label: 'Review',
      severity: reviewPassed ? 'ok' : 'warning',
      summary: reviewPassed ? '代码审查已通过' : '代码审查证据待确认',
      detail: args.review.result,
    },
    {
      id: 'install',
      label: 'Install Health',
      severity: install == null || install.passed ? 'ok' : 'warning',
      summary: install == null ? '未发现安装健康报告' : install.passed ? '安装健康检查通过' : '安装健康检查需处理',
      detail: install == null ? '暂无 install health' : `${install.errors} 错误 · ${install.warnings} 警告${install.recommended_command ? ` · ${install.recommended_command}` : ''}`,
    },
    {
      id: 'lesson',
      label: 'Lesson',
      severity: args.project.lesson_pending_count > 0 ? 'warning' : 'ok',
      summary: args.project.lesson_pending_count > 0 ? '存在待固化经验' : '无待固化经验',
      detail: `${args.project.lesson_pending_count} 条 lesson 候选`,
    },
    {
      id: 'backlog',
      label: 'Backlog',
      severity: activeBacklog > 0 ? 'warning' : 'ok',
      summary: activeBacklog > 0 ? '存在待处理需求' : '暂无待处理需求',
      detail: Object.entries(args.backlog.by_status).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无 backlog 条目',
    },
  ];
  const error = signals.filter((signal) => signal.severity === 'error').length;
  const warning = signals.filter((signal) => signal.severity === 'warning').length;
  const ok = signals.filter((signal) => signal.severity === 'ok').length;
  return {
    status: error > 0 ? 'error' : warning > 0 ? 'warning' : 'ok',
    ok,
    warning,
    error,
    signals,
    attention_queue: signals.filter((signal) => signal.severity !== 'ok'),
  };
}

async function loadDashboardInputs(cwd: string, docpathDir: string) {
  const state = await readCurrentState(cwd);
  const rawBreadcrumb = await readBreadcrumb(cwd);
  const backlog = await listBacklogItems(cwd);
  const plan = parsePlanTasks(await readOptionalFile(join(docpathDir, 'tasks', 'current', 'plan.md')));
  const checkRaw = await readOptionalFile(join(docpathDir, 'workspace', 'last-check.md'));
  const reviewRaw = await readOptionalFile(join(docpathDir, 'workspace', 'review.md'));
  const registeredProjects = await listRegisteredProjects();
  return { state, rawBreadcrumb, backlog, plan, checkRaw, reviewRaw, registeredProjects };
}

function inferNextView(args: {
  phase: string;
  gate: string;
  plan: Array<{ id: string; title: string; done: boolean }>;
}): DashboardData['next'] {
  const nextStep = args.plan.find((item) => !item.done);
  if (args.phase === 'drafting') {
    return { action: '规约已就绪时生成执行计划', command: 'docpath plan', required_files: ['.docpath/tasks/current/spec.md'] };
  }
  if (args.phase === 'planning' && nextStep) {
    return { action: `执行下一个计划步骤: ${nextStep.id}`, command: `docpath go --step ${nextStep.id}`, required_files: ['.docpath/tasks/current/plan.md'] };
  }
  if (args.phase === 'executing' && nextStep) {
    return { action: `继续执行未完成步骤: ${nextStep.id}`, command: `docpath go --step ${nextStep.id}`, required_files: ['.docpath/tasks/current/plan.md', '.docpath/workspace/breadcrumb.md'] };
  }
  if (args.phase === 'checking' || args.gate === 'check_fail') {
    return { action: '运行质量门禁并处理失败项', command: 'docpath check', required_files: ['.docpath/workspace/last-check.md'] };
  }
  if (args.phase === 'reviewing' || args.gate === 'review_fail') {
    return { action: '运行代码审查并处理意见', command: 'docpath review', required_files: ['.docpath/workspace/review.md'] };
  }
  if (args.phase === 'completed') {
    return { action: '当前任务已完成，查看 next 路由选择后续动作', command: 'docpath next --agent', required_files: ['.docpath/workspace/current.md'] };
  }
  return { action: '查看 DocPath 推荐路线', command: 'docpath next --agent', required_files: ['.docpath/workspace/current.md'] };
}

function latestBreadcrumbForStep(breadcrumb: DashboardData['breadcrumb'], stepId: string): DashboardData['breadcrumb']['entries'][number] | null {
  return breadcrumb.entries.slice().reverse().find((entry) => entry.step === stepId) || null;
}

function flowNodeSummary(node: DashboardData['flow'][number], current: DashboardData['current'], evidence: DashboardData['evidence']): string {
  if (node.id === current.phase) return `当前阶段 · gate: ${current.gate}`;
  if (node.id === 'checking') return evidence.check.result;
  if (node.id === 'reviewing') return evidence.review.result;
  if (node.complete) return '已完成或已越过';
  return '待推进';
}

function buildTaskDetail(args: {
  current: DashboardData['current'];
  next: DashboardData['next'];
  flow: DashboardData['flow'];
  plan: DashboardData['plan'];
  breadcrumb: DashboardData['breadcrumb'];
  evidence: DashboardData['evidence'];
}): TaskDetail {
  const doneSteps = args.plan.filter((step) => step.done).length;
  return {
    task_id: args.current.task_id,
    title: args.current.task_title,
    phase: args.current.phase,
    gate: args.current.gate,
    level: args.current.level,
    current_step: args.current.current_step,
    next_action: args.next,
    progress: {
      total_steps: args.plan.length,
      done_steps: doneSteps,
      remaining_steps: Math.max(0, args.plan.length - doneSteps),
      breadcrumb_entries: args.breadcrumb.total,
      blocked_entries: args.breadcrumb.blocked,
    },
    steps: args.plan.map((step) => {
      const latest = latestBreadcrumbForStep(args.breadcrumb, step.id);
      return {
        id: step.id,
        title: step.title,
        done: step.done,
        breadcrumb_status: latest?.status || null,
        breadcrumb_context: latest?.context || null,
        breadcrumb_time: latest?.timestamp || null,
      };
    }),
    flow_nodes: args.flow.map((node) => ({
      ...node,
      summary: flowNodeSummary(node, args.current, args.evidence),
    })),
    evidence_summary: {
      check: args.evidence.check.result,
      review: args.evidence.review.result,
    },
  };
}

function buildHandoffSummary(args: {
  current: DashboardData['current'];
  next: DashboardData['next'];
  breadcrumb: DashboardData['breadcrumb'];
  evidence: DashboardData['evidence'];
  documentPreviews: DocumentPreview[];
}): HandoffSummary {
  const required = new Set<string>(['.docpath/workspace/current.md', '.docpath/workspace/breadcrumb.md']);
  for (const file of args.next.required_files) required.add(file);
  for (const preview of args.documentPreviews) if (preview.exists) required.add(preview.path);
  return {
    commands: [
      { id: 'handoff', label: '生成交接包', command: 'docpath agent handoff', description: '写入 workspace/compact-context.md，适合切换会话前使用' },
      { id: 'context', label: '生成上下文包', command: 'docpath context --max-tokens 8000', description: '输出可复制给 agent 的上下文摘要' },
      { id: 'reveal', label: '渐进上下文', command: 'docpath reveal --level 2', description: '按层级查看任务、文档和规则上下文' },
    ],
    required_files: [...required].slice(0, 12),
    recent_breadcrumbs: args.breadcrumb.entries.slice(-8),
    progress: {
      done: args.breadcrumb.done,
      total: args.breadcrumb.total,
      blocked: args.breadcrumb.blocked,
    },
    evidence: {
      check: args.evidence.check.result,
      review: args.evidence.review.result,
    },
    resume_protocol: [
      '读取 .docpath/workspace/current.md',
      '读取 Handoff 视图中的必读文件',
      `执行推荐命令: ${args.next.command}`,
      '状态变化后刷新 Dashboard 或运行 docpath next --agent',
    ],
  };
}

function buildActionCenter(args: {
  next: DashboardData['next'];
  health: HealthSummary;
  changes: DashboardChanges;
  handoff: HandoffSummary;
  backlog: DashboardData['backlog'];
  selectedProject: SelectedProjectSummary;
  projectDirectory: ProjectDirectoryEntry[];
}): ActionCenter {
  const attentionCommands = args.health.attention_queue.slice(0, 4).map((signal): ActionItem => ({
    id: `health-${signal.id}`,
    label: signal.label,
    command: signal.id === 'check' ? 'docpath check' : signal.id === 'review' ? 'docpath review' : signal.id === 'install' ? 'docpath install --target codex' : args.next.command,
    description: `${signal.summary} · ${signal.detail}`,
    href: `#${signal.id === 'backlog' ? 'backlog' : signal.id === 'workflow' ? 'workflow' : 'health'}`,
    emphasis: signal.severity === 'error' ? 'attention' : 'normal',
  }));
  const projectCommands = args.projectDirectory.slice(0, 4).map((project): ActionItem => ({
    id: `project-${project.name}`,
    label: project.selected ? `当前项目: ${project.name}` : `打开项目: ${project.name}`,
    command: `docpath dashboard --root ${project.root}`,
    description: `${project.phase} / ${project.gate} · ${project.root}`,
    href: project.href,
    emphasis: project.selected ? 'primary' : 'normal',
  }));
  const backlogCommands: ActionItem[] = [
    {
      id: 'backlog-active',
      label: '查看活跃 Backlog',
      command: 'docpath dashboard --status active',
      description: `${args.backlog.by_status.active || 0} 条 active · ${args.backlog.filtered_total}/${args.backlog.total} 条当前匹配`,
      href: '/?status=active#backlog',
      emphasis: (args.backlog.by_status.active || 0) > 0 ? 'attention' : 'normal',
    },
    {
      id: 'backlog-next',
      label: '创建下一个 Backlog',
      command: 'docpath backlog add --title "..."',
      description: '当前任务完成后用于登记新的需求入口',
      href: '#backlog',
      emphasis: 'normal',
    },
  ];
  const changeCommands: ActionItem[] = [
    {
      id: 'changes-open',
      label: args.changes.ready_to_commit ? '变更可收口' : '查看变更阻塞',
      command: 'docpath changes',
      description: args.changes.available
        ? `${args.changes.counts.total} 个文件 · ${args.changes.ready_to_commit ? 'ready' : `${args.changes.blocking_reasons.length} 个阻塞`}`
        : args.changes.error || '当前目录不是 git 仓库',
      href: '#changes',
      emphasis: args.changes.ready_to_commit ? 'primary' : 'attention',
    },
  ];
  const handoffCommands = args.handoff.commands.slice(0, 2).map((item): ActionItem => ({
    id: `handoff-${item.id}`,
    label: item.label,
    command: item.command,
    description: item.description,
    href: '#handoff',
    emphasis: item.id === 'handoff' ? 'primary' : 'normal',
  }));
  return {
    groups: [
      {
        id: 'next',
        title: 'Next Action',
        items: [{ id: 'next-command', label: args.next.action, command: args.next.command, description: args.next.required_files.join(' · ') || '无额外文件依赖', href: '#workflow', emphasis: 'primary' }],
      },
      { id: 'quality', title: 'Check / Review', items: attentionCommands.length > 0 ? attentionCommands : [{ id: 'quality-ok', label: '质量状态正常', command: 'docpath next --agent', description: '当前没有健康关注项', href: '#health', emphasis: 'normal' }] },
      { id: 'changes', title: 'Changes', items: changeCommands },
      { id: 'handoff', title: 'Handoff', items: handoffCommands },
      { id: 'backlog', title: 'Backlog', items: backlogCommands },
      { id: 'projects', title: 'Projects', items: projectCommands.length > 0 ? projectCommands : [{ id: 'project-none', label: args.selectedProject.message, command: 'docpath projects', description: '查看本地项目注册中心', href: '#project', emphasis: 'normal' }] },
    ],
  };
}

function buildCommandPalette(args: {
  navigation: WorkspaceSummary['navigation'];
  actionCenter: ActionCenter;
  projectDirectory: ProjectDirectoryEntry[];
}): CommandPaletteItem[] {
  const views = args.navigation.map((item): CommandPaletteItem => ({
    id: `view-${item.id}`,
    type: 'view',
    label: item.label,
    detail: `打开 ${item.label} 视图`,
    href: item.href,
    command: null,
  }));
  const commands = args.actionCenter.groups.flatMap((group) => group.items.map((item): CommandPaletteItem => ({
    id: `command-${group.id}-${item.id}`,
    type: 'command',
    label: item.label,
    detail: item.description,
    href: item.href,
    command: item.command,
  })));
  const projects = args.projectDirectory.slice(0, 12).map((project): CommandPaletteItem => ({
    id: `project-${project.name}`,
    type: 'project',
    label: project.name,
    detail: `${project.phase} / ${project.gate} · ${project.root}`,
    href: project.href,
    command: `docpath dashboard --root ${project.root}`,
  }));
  return [...views, ...commands, ...projects].slice(0, 40);
}

export async function buildDashboardData(cwd: string, query: DashboardQuery = {}): Promise<DashboardData> {
  const docpathDir = await resolveDocpathDir(cwd);
  if (!existsSync(docpathDir)) {
    throw new Error('docpath dashboard: 未找到 .docpath/ 目录，请先运行 docpath init');
  }

  const { state, rawBreadcrumb, backlog, plan, checkRaw, reviewRaw, registeredProjects } = await loadDashboardInputs(cwd, docpathDir);
  const check = summarizeEvidence(checkRaw, '暂无 check 证据');
  const review = summarizeEvidence(reviewRaw, '暂无 review 证据');
  const phase = state?.phase || 'idle';
  const gate = state?.gate || 'none';
  const taskBreadcrumb = summarizeTaskBreadcrumb(rawBreadcrumb.entries, state?.task_id || '');
  const backlogSummary = summarizeBacklog(backlog, query);
  const projectSummary = await summarizeProject({ cwd, docpathDir, backlog, backlogSummary });
  const health = summarizeHealth({ phase, gate, breadcrumb: taskBreadcrumb, check, review, project: projectSummary, backlog: backlogSummary });
  const selectedProject = resolveSelectedProject({ cwd, projects: registeredProjects, selection: query });
  const projectDirectory = buildProjectDirectory(registeredProjects, selectedProject, cwd);
  const documentPreviews = await buildDocumentPreviews(docpathDir);
  const changes = await summarizeChanges(cwd);

  return assembleDashboardData({
    cwd,
    docpathDir,
    state,
    plan,
    phase,
    gate,
    taskBreadcrumb,
    check,
    review,
    health,
    changes,
    documentPreviews,
    selectedProject,
    projectDirectory,
    projectSummary,
    backlogSummary,
    registeredProjects,
  });
}

function assembleDashboardData(args: {
  cwd: string;
  docpathDir: string;
  state: Awaited<ReturnType<typeof readCurrentState>>;
  plan: DashboardData['plan'];
  phase: string;
  gate: string;
  taskBreadcrumb: DashboardData['breadcrumb'];
  check: EvidenceSummary;
  review: EvidenceSummary;
  health: HealthSummary;
  changes: DashboardChanges;
  documentPreviews: DocumentPreview[];
  selectedProject: SelectedProjectSummary;
  projectDirectory: ProjectDirectoryEntry[];
  projectSummary: ProjectSummary;
  backlogSummary: DashboardData['backlog'];
  registeredProjects: RegisteredProject[];
}): DashboardData {
  const current = {
    task_id: args.state?.task_id || '',
    task_title: args.state?.task_title || '未命名任务',
    phase: args.phase,
    gate: args.gate,
    level: args.state?.level ?? null,
    current_step: args.state?.current_step || '待确认下一步',
  };
  const next = inferNextView({ phase: args.phase, gate: args.gate, plan: args.plan });
  const flow = buildFlow(args.phase, args.gate);
  const breadcrumb = {
    total: args.taskBreadcrumb.entries.length,
    done: args.taskBreadcrumb.done,
    in_progress: args.taskBreadcrumb.in_progress,
    blocked: args.taskBreadcrumb.blocked,
    entries: args.taskBreadcrumb.entries.slice(-20).map((entry) => ({
      step: entry.step,
      status: entry.status,
      timestamp: entry.timestamp,
      context: entry.context,
    })),
  };
  const evidence = {
    check: args.check,
    review: args.review,
  };
  const handoff = buildHandoffSummary({ current, next, breadcrumb, evidence, documentPreviews: args.documentPreviews });
  const team = summarizeTeam(args.registeredProjects);
  const overview = buildOverviewSummary({
    current,
    next,
    health: args.health,
    changes: args.changes,
    handoff,
    backlog: args.backlogSummary,
    project: args.projectSummary,
    team,
  });
  const activity = buildActivitySummary({
    next,
    breadcrumb,
    evidence,
    changes: args.changes,
    backlog: args.backlogSummary,
    handoff,
  });
  const session = buildSessionSummary({
    current,
    next,
    health: args.health,
    changes: args.changes,
    handoff,
    activity,
    project: args.projectSummary,
  });
  const readiness = buildReadinessSummary({
    current,
    next,
    health: args.health,
    changes: args.changes,
    handoff,
    backlog: args.backlogSummary,
    project: args.projectSummary,
    evidence,
  });
  const docsIndex = buildDocsIndex({ docpathDir: args.docpathDir, documentPreviews: args.documentPreviews, handoff, next });
  const settings = buildSettingsSummary({
    cwd: args.cwd,
    docpathDir: args.docpathDir,
    project: args.projectSummary,
    registryTotal: args.registeredProjects.length,
  });
  const navigation = WORKSPACE_NAVIGATION.map((item) => ({ ...item }));
  const workbenchMap = buildWorkbenchMap({
    navigation,
    current,
    next,
    health: args.health,
    readiness,
    changes: args.changes,
    handoff,
    team,
    project: args.projectSummary,
    settings,
    docsIndex,
  });
  const actionCenter = buildActionCenter({
    next,
    health: args.health,
    changes: args.changes,
    handoff,
    backlog: args.backlogSummary,
    selectedProject: args.selectedProject,
    projectDirectory: args.projectDirectory,
  });
  const commandPalette = buildCommandPalette({ navigation, actionCenter, projectDirectory: args.projectDirectory });
  const completionAudit = buildCompletionAudit({
    workspace: {
      product: 'DocPath 工作台',
      mode: 'read-only',
      navigation,
    },
    current,
    next,
    flow,
    plan: args.plan,
    breadcrumb,
    evidence,
    backlog: args.backlogSummary,
    overview,
    session,
    readiness,
    docsIndex,
    settings,
    workbenchMap,
    actionCenter,
    commandPalette,
    team,
    project: args.projectSummary,
    registeredProjects: args.registeredProjects,
    projectDirectory: args.projectDirectory,
    selectedProject: args.selectedProject,
  });
  return {
    generated_at: new Date().toISOString(),
    workspace: {
      product: 'DocPath 工作台',
      mode: 'read-only',
      navigation,
    },
    overview,
    activity,
    session,
    readiness,
    docs_index: docsIndex,
    settings,
    workbench_map: workbenchMap,
    completion_audit: completionAudit,
    action_center: actionCenter,
    command_palette: commandPalette,
    health: args.health,
    task_detail: buildTaskDetail({ current, next, flow, plan: args.plan, breadcrumb, evidence }),
    document_previews: args.documentPreviews,
    changes: args.changes,
    handoff,
    team,
    project: args.projectSummary,
    current,
    next,
    flow,
    plan: args.plan,
    breadcrumb,
    evidence,
    backlog: args.backlogSummary,
    registry: {
      total: args.registeredProjects.length,
      projects: args.registeredProjects,
    },
    project_directory: args.projectDirectory,
    selected_project: args.selectedProject,
  };
}

function summarizeTaskBreadcrumb(entries: Awaited<ReturnType<typeof readBreadcrumb>>['entries'], taskId: string): DashboardData['breadcrumb'] {
  const scoped = taskId ? entries.filter((entry) => entry.taskId === taskId) : entries;
  return {
    total: scoped.length,
    done: scoped.filter((entry) => entry.status === 'done').length,
    in_progress: scoped.filter((entry) => entry.status === 'in_progress').length,
    blocked: scoped.filter((entry) => entry.status === 'blocked').length,
    entries: scoped.slice(-20).map((entry) => ({
      step: entry.step,
      status: entry.status,
      timestamp: entry.timestamp,
      context: entry.context,
    })),
  };
}

function normalizeBacklogFilter(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function serializeBacklogItem(item: Awaited<ReturnType<typeof listBacklogItems>>[number]): DashboardData['backlog']['items'][number] {
  return { id: item.id, title: item.title, status: item.status, priority: item.priority, level: item.level, task: item.links.task };
}

function matchesBacklogFilters(item: Awaited<ReturnType<typeof listBacklogItems>>[number], filters: DashboardData['backlog']['filters']): boolean {
  if (filters.status && item.status !== filters.status) return false;
  if (filters.priority && item.priority !== filters.priority) return false;
  if (filters.q) {
    const haystack = [item.id, item.title, item.status, item.priority, item.links.task || ''].join(' ').toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function summarizeBacklog(backlog: Awaited<ReturnType<typeof listBacklogItems>>, query: DashboardQuery = {}): DashboardData['backlog'] {
  const byStatus: Record<string, number> = {};
  for (const item of backlog) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const filters = {
    status: normalizeBacklogFilter(query.status),
    priority: normalizeBacklogFilter(query.priority),
    q: normalizeBacklogFilter(query.q),
  };
  const sorted = backlog
    .slice()
    .sort((a, b) =>
      (BACKLOG_STATUS_ORDER.get(a.status) ?? 99) - (BACKLOG_STATUS_ORDER.get(b.status) ?? 99)
      || a.priority.localeCompare(b.priority)
      || a.id.localeCompare(b.id, undefined, { numeric: true })
    );
  const filtered = sorted.filter((item) => matchesBacklogFilters(item, filters));
  const groups = Object.entries(filtered.reduce<Record<string, typeof filtered>>((acc, item) => {
    (acc[item.status] ||= []).push(item);
    return acc;
  }, {}))
    .sort(([a], [b]) => (BACKLOG_STATUS_ORDER.get(a) ?? 99) - (BACKLOG_STATUS_ORDER.get(b) ?? 99) || a.localeCompare(b))
    .map(([status, items]) => ({ status, count: items.length, items: items.slice(0, 8).map(serializeBacklogItem) }));
  return {
    total: backlog.length,
    by_status: byStatus,
    filters,
    filtered_total: filtered.length,
    items: sorted.slice(0, 12).map(serializeBacklogItem),
    filtered_items: filtered.slice(0, 24).map(serializeBacklogItem),
    groups,
  };
}

function renderMetric(label: string, value: string, detail = ''): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</div>`;
}

function renderLiveMetric(label: string, value: string, field: string, detail = '', detailField = ''): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong data-live-field="${escapeHtml(field)}">${escapeHtml(value)}</strong>${detail ? `<small${detailField ? ` data-live-field="${escapeHtml(detailField)}"` : ''}>${escapeHtml(detail)}</small>` : ''}</div>`;
}

export function renderDashboardHtml(data: DashboardData): string {
  const reactCss = readDashboardUiCss();
  const reactBody = renderToStaticMarkup(createElement(DashboardApp, { data }));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(data.workspace.product)}</title>
  <style>
${DASHBOARD_CSS}
${reactCss}
  </style>
</head>
<body>
  <main>
    <div data-react-dashboard-root>${reactBody}</div>
    <div style="display: none !important;" aria-hidden="true">
      ${renderLegacyDashboardTail(data)}
    </div>
  </main>
  <script>window.__DOCPATH_DASHBOARD_DATA__ = ${serializeDashboardData(data)};</script>
  <script>
${DASHBOARD_SCRIPT}
  </script>
</body>
</html>`;
}

function readDashboardUiCss(): string {
  if (!existsSync(DASHBOARD_UI_CSS_PATH)) return '';
  return readFileSync(DASHBOARD_UI_CSS_PATH, 'utf-8');
}

function serializeDashboardData(data: DashboardData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function renderLegacyDashboardTail(data: DashboardData): string {
  return `${renderAppChrome(data)}
    ${renderSearchFilter()}
    ${renderOverviewLayer(data)}
    ${renderWorkbenchMapLayer(data)}
    ${renderSessionLayer(data)}
    ${renderReadinessLayer(data)}
    ${renderCompletionAuditLayer(data)}
    ${renderDocsIndexLayer(data)}
    ${renderSettingsLayer(data)}
    ${renderActivityLayer(data)}
    ${renderTeamLayer(data)}
    ${renderActionCenter(data)}
    ${renderProjectLayer(data)}
    ${renderTaskDetail(data)}
    ${renderChangesLayer(data)}
    ${renderHandoffLayer(data)}
    ${renderDocumentPreviews(data)}
    ${renderHealthLayer(data)}
    ${renderWorkflowSummary(data)}
    <section class="panel view-section" id="flow" data-view="workflow"><h2>流程图</h2><ol class="flow">${renderFlow(data)}</ol></section>
    ${renderDashboardLowerLayout(data)}`;
}

function renderSearchFilter(): string {
  return `<div class="search-filter" data-search-filter><input type="search" placeholder="过滤当前工作台内容" aria-label="只读过滤工作台内容" data-search-input><button class="icon-button" type="button" data-search-clear>清除</button><small data-search-count>显示全部只读内容</small></div><div data-search-empty>没有匹配的只读内容。</div>`;
}

function renderDocsIndexLayer(data: DashboardData): string {
  const docs = data.docs_index;
  return `<section id="docs-index" data-view="docs-index" class="grid docs-index-grid view-section">
      <div class="panel">
        <p class="eyebrow">Docs Index</p>
        <h2>文档索引</h2>
        <div class="status-grid">
          <div class="status-cell"><span>索引项</span><strong data-live-field="docs_index_total">${docs.total}</strong></div>
          <div class="status-cell"><span>已存在</span><strong data-live-field="docs_index_existing">${docs.existing}</strong></div>
          <div class="status-cell"><span>缺失项</span><strong data-live-field="docs_index_missing">${docs.missing}</strong></div>
        </div>
        <h2 style="margin-top:16px">缺失项</h2>
        <ul class="docs-index-list" data-team-docs-index-missing>${renderDocsIndexMissing(docs.missing_entries)}</ul>
      </div>
      <div class="grid docs-index-groups" data-team-docs-index-groups>${renderDocsIndexGroups(docs.groups)}</div>
    </section>`;
}

function renderDocsIndexGroups(groups: DocsIndexSummary['groups']): string {
  return groups.map((group) => `<section class="panel docs-index-group"><h2>${escapeHtml(group.label)} · ${group.count}</h2><ul class="docs-index-list">${renderDocsIndexEntries(group.entries)}</ul></section>`).join('');
}

function renderDocsIndexEntries(entries: DocsIndexEntry[]): string {
  return entries.map((entry) => `<li class="${entry.exists ? 'ok' : 'warning'}"><div class="signal-head"><b>${escapeHtml(entry.label)}</b><span class="severity ${entry.exists ? 'ok' : 'warning'}">${entry.exists ? 'exists' : 'missing'}</span></div><small>${escapeHtml(entry.path)}</small><p>${escapeHtml(entry.detail)}</p></li>`).join('');
}

function renderDocsIndexMissing(entries: DocsIndexEntry[]): string {
  return entries.length > 0 ? renderDocsIndexEntries(entries) : '<li class="ok"><b>暂无缺失项</b><p>当前索引文件均存在。</p></li>';
}

function renderSettingsLayer(data: DashboardData): string {
  const settings = data.settings;
  const install = settings.install;
  return `<section id="settings" data-view="settings" class="grid settings-grid view-section">
      <div class="panel">
        <p class="eyebrow">Workbench Settings</p>
        <h2>运行配置</h2>
        <div class="status-grid">
          <div class="status-cell"><span>模式</span><strong data-live-field="settings_mode">${escapeHtml(settings.service.mode)}</strong></div>
          <div class="status-cell"><span>服务地址</span><strong data-live-field="settings_endpoint">${escapeHtml(settings.service.endpoint)}</strong><small data-live-field="settings_api">${escapeHtml(settings.service.api)}</small></div>
          <div class="status-cell"><span>Registry 项目</span><strong data-live-field="settings_registry_total">${settings.registry.total_projects}</strong><small data-live-field="settings_registry_exists">${settings.registry.exists ? 'exists' : 'missing'}</small></div>
          <div class="status-cell"><span>Install Target</span><strong data-live-field="settings_install_target">${escapeHtml(install?.target || '-')}</strong></div>
          <div class="status-cell"><span>Install Status</span><strong data-live-field="settings_install_status">${escapeHtml(install ? (install.passed ? 'PASS' : 'ATTENTION') : 'UNKNOWN')}</strong><small data-live-field="settings_install_issues">${escapeHtml(install ? `${install.errors} 错误 · ${install.warnings} 警告` : '-')}</small></div>
        </div>
        <h2 style="margin-top:16px">路径</h2>
        <ul class="settings-list" data-team-settings-paths>${renderSettingsPathItems(settings.paths)}</ul>
      </div>
      <div class="panel">
        <p class="eyebrow">Data Sources</p>
        <h2>数据源</h2>
        <ul class="settings-list" data-team-settings-data-sources>${renderSettingsDataSources(settings.data_sources)}</ul>
        <h2 style="margin-top:16px">命令模板</h2>
        <ul class="settings-list" data-team-settings-command-templates>${renderSettingsCommandTemplates(settings.command_templates)}</ul>
        <h2 style="margin-top:16px">Registry DB</h2>
        <ul class="settings-list"><li class="${settings.registry.exists ? 'ok' : 'warning'}"><div class="signal-head"><b>SQLite Registry</b><span class="severity ${settings.registry.exists ? 'ok' : 'warning'}">${settings.registry.exists ? 'exists' : 'missing'}</span></div><small data-live-field="settings_registry_path">${escapeHtml(settings.registry.db_path)}</small></li></ul>
      </div>
    </section>`;
}

function renderSettingsPathItems(items: SettingsSummary['paths']): string {
  return items.map((item) => `<li class="${item.exists ? 'ok' : 'warning'}"><div class="signal-head"><b>${escapeHtml(item.label)}</b><span class="severity ${item.exists ? 'ok' : 'warning'}">${item.exists ? 'exists' : 'missing'}</span></div><small>${escapeHtml(item.path)}</small></li>`).join('');
}

function renderSettingsDataSources(items: SettingsSummary['data_sources']): string {
  return items.map((item) => `<li class="${item.exists ? 'ok' : 'warning'}"><div class="signal-head"><b>${escapeHtml(item.label)}</b><span class="severity ${item.exists ? 'ok' : 'warning'}">${item.exists ? 'exists' : 'missing'}</span></div><small>${escapeHtml(item.path)}</small><p>${escapeHtml(item.detail)}</p></li>`).join('');
}

function renderSettingsCommandTemplates(items: SettingsSummary['command_templates']): string {
  return items.map((item) => `<li class="${item.exists ? 'ok' : 'warning'}"><div class="signal-head"><b>${escapeHtml(item.label)}</b><span class="severity ${item.exists ? 'ok' : 'warning'}">${item.exists ? 'exists' : 'missing'}</span></div><small>${escapeHtml(item.path)}</small><div class="command-row"><code>${escapeHtml(item.command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(item.command)}">复制</button></div></li>`).join('');
}

function renderReadinessLayer(data: DashboardData): string {
  const readiness = data.readiness;
  return `<section id="readiness" data-view="readiness" class="grid readiness-grid view-section">
      <div class="panel">
        <p class="eyebrow">Readiness Audit</p>
        <h2>收口审计</h2>
        <div class="status-grid">
          <div class="status-cell"><span>分数</span><strong data-live-field="readiness_score">${readiness.score}%</strong></div>
          <div class="status-cell"><span>状态</span><strong data-live-field="readiness_status">${escapeHtml(readiness.status)}</strong></div>
          <div class="status-cell"><span>可继续</span><strong data-live-field="readiness_continue">${readiness.ready_to_continue ? 'YES' : 'NO'}</strong></div>
          <div class="status-cell"><span>可交接</span><strong data-live-field="readiness_handoff">${readiness.ready_to_handoff ? 'YES' : 'NO'}</strong></div>
          <div class="status-cell"><span>可提交</span><strong data-live-field="readiness_commit">${readiness.ready_to_commit ? 'YES' : 'NO'}</strong></div>
          <div class="status-cell"><span>可归档</span><strong data-live-field="readiness_archive">${readiness.ready_to_archive ? 'YES' : 'NO'}</strong></div>
          <div class="status-cell"><span>阻塞项</span><strong data-live-field="readiness_blocker_count">${readiness.blockers.length}</strong></div>
        </div>
        <div class="overview-command">
          <p>下一条审计命令</p>
          <div class="command-row"><code data-live-field="readiness_next_command">${escapeHtml(readiness.next_command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(readiness.next_command)}">复制</button></div>
        </div>
        <h2 style="margin-top:16px">阻塞项</h2>
        <ul class="readiness-list" data-team-readiness-blockers>${renderReadinessBlockers(readiness.blockers)}</ul>
      </div>
      <div class="panel">
        <p class="eyebrow">Audit Signals</p>
        <h2>收口信号</h2>
        <ul class="readiness-list" data-team-readiness-signals>${renderReadinessSignals(readiness.signals)}</ul>
      </div>
    </section>`;
}

function renderReadinessSignals(signals: ReadinessSignal[]): string {
  return signals.map((signal) => {
    const command = signal.command ? `<div class="command-row"><code>${escapeHtml(signal.command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(signal.command)}">复制</button></div>` : '';
    return `<li class="${escapeHtml(signal.severity)}"><div class="signal-head"><b>${escapeHtml(signal.label)}</b><span class="severity ${escapeHtml(signal.severity)}">${escapeHtml(signal.status)}</span></div><p>${escapeHtml(signal.summary)}</p><small>${escapeHtml(signal.detail)}</small><a href="${escapeHtml(signal.href)}">打开</a>${command}</li>`;
  }).join('');
}

function renderCompletionAuditLayer(data: DashboardData): string {
  const audit = data.completion_audit;
  return `<section id="audit" data-view="audit" class="grid readiness-grid view-section">
      <div class="panel">
        <p class="eyebrow">Completion Audit</p>
        <h2>完成度审计</h2>
        <div class="status-grid">
          <div class="status-cell"><span>总分</span><strong data-live-field="audit_score">${audit.score}%</strong></div>
          <div class="status-cell"><span>状态</span><strong data-live-field="audit_status">${escapeHtml(audit.status)}</strong></div>
          <div class="status-cell"><span>已证明</span><strong data-live-field="audit_ready">${audit.ready}/${audit.total}</strong></div>
          <div class="status-cell"><span>关注项</span><strong data-live-field="audit_attention">${audit.attention}</strong></div>
          <div class="status-cell"><span>阻塞项</span><strong data-live-field="audit_blocked">${audit.blocked}</strong></div>
        </div>
      </div>
      <div class="panel">
        <p class="eyebrow">Requirement Evidence</p>
        <h2>要求与证据</h2>
        <ul class="readiness-list" data-team-completion-audit-items>${renderCompletionAuditItems(audit.items)}</ul>
      </div>
    </section>`;
}

function renderCompletionAuditItems(items: CompletionAuditItem[]): string {
  return items.map((item) => {
    const severity = item.status === 'ready' ? 'ok' : item.status === 'blocked' ? 'error' : 'warning';
    return `<li class="${severity}"><div class="signal-head"><b>${escapeHtml(item.requirement)}</b><span class="severity ${severity}">${escapeHtml(item.status)}</span></div><div class="audit-evidence">${renderCompletionAuditEvidence(item.evidence)}</div><p>${escapeHtml(item.gap)}</p></li>`;
  }).join('');
}

function renderCompletionAuditEvidence(items: CompletionAuditItem['evidence']): string {
  return items.map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a><small>${escapeHtml(item.detail)}</small>`).join('');
}

function renderReadinessBlockers(blockers: string[]): string {
  return blockers.length > 0
    ? blockers.map((item) => `<li class="error">${escapeHtml(item)}</li>`).join('')
    : '<li class="ok">暂无阻塞项</li>';
}

function renderSessionLayer(data: DashboardData): string {
  const session = data.session;
  return `<section id="session" data-view="session" class="grid session-grid view-section">
      <div class="panel">
        <p class="eyebrow">Session Recovery</p>
        <h2>恢复现场</h2>
        <div class="status-grid">
          <div class="status-cell"><span>状态</span><strong data-live-field="session_status">${escapeHtml(session.status)}</strong></div>
          <div class="status-cell"><span>当前任务</span><strong data-live-field="session_task">${escapeHtml(session.task.title)}</strong><small>${escapeHtml(session.task.id || '-')}</small></div>
          <div class="status-cell"><span>当前步骤</span><strong data-live-field="session_step">${escapeHtml(session.task.step)}</strong></div>
          <div class="status-cell"><span>服务地址</span><strong data-live-field="session_endpoint">${escapeHtml(session.service.endpoint)}</strong><small data-live-field="session_api">${escapeHtml(session.service.api)}</small></div>
          <div class="status-cell"><span>Check</span><strong data-live-field="session_check">${escapeHtml(session.evidence.check)}</strong></div>
          <div class="status-cell"><span>Review</span><strong data-live-field="session_review">${escapeHtml(session.evidence.review)}</strong></div>
          <div class="status-cell"><span>必读文件</span><strong data-live-field="session_file_count">${session.required_files.length}</strong></div>
          <div class="status-cell"><span>风险提示</span><strong data-live-field="session_risk_count">${session.risks.length}</strong></div>
        </div>
        <h2 style="margin-top:16px">恢复命令</h2>
        <ul class="session-list" data-team-session-commands>${renderSessionCommands(session.recovery_commands)}</ul>
      </div>
      <div class="panel">
        <p class="eyebrow">只读恢复协议</p>
        <h2>恢复检查</h2>
        <div class="split-list">
          <div><p class="eyebrow">必读文件</p><ul class="session-list" data-team-session-files>${renderSessionFiles(session.required_files)}</ul></div>
          <div><p class="eyebrow">风险提示</p><ul class="session-list" data-team-session-risks>${renderSessionRisks(session.risks)}</ul></div>
        </div>
        <h2 style="margin-top:16px">协议</h2>
        <ol class="session-list" data-team-session-protocol>${renderSessionProtocol(session.protocol)}</ol>
      </div>
    </section>`;
}

function renderSessionCommands(commands: SessionSummary['recovery_commands']): string {
  return commands.map((item) => `<li><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.detail)}</small><div class="command-row"><code>${escapeHtml(item.command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(item.command)}">复制</button></div></li>`).join('');
}

function renderSessionFiles(files: string[]): string {
  return files.length > 0 ? files.map((file) => `<li>${escapeHtml(file)}</li>`).join('') : '<li>.docpath/workspace/current.md</li>';
}

function renderSessionRisks(risks: SessionSummary['risks']): string {
  return risks.length > 0
    ? risks.map((item) => `<li class="${escapeHtml(item.severity)}"><div class="signal-head"><b>${escapeHtml(item.label)}</b><span class="severity ${escapeHtml(item.severity)}">${escapeHtml(item.severity)}</span></div><p>${escapeHtml(item.detail)}</p><a href="${escapeHtml(item.href)}">打开</a></li>`).join('')
    : '<li class="ok"><b>暂无风险</b><p>当前恢复视角没有关注项。</p></li>';
}

function renderSessionProtocol(protocol: string[]): string {
  return protocol.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderActivityLayer(data: DashboardData): string {
  return `<section id="activity" data-view="activity" class="grid activity-grid view-section">
      <div class="panel">
        <p class="eyebrow">Activity Timeline</p>
        <h2>工作流活动</h2>
        <div class="status-grid">
          <div class="status-cell"><span>事件总数</span><strong data-live-field="activity_total">${data.activity.total}</strong></div>
          <div class="status-cell"><span>最新时间</span><strong data-live-field="activity_latest_time">${escapeHtml(data.activity.latest_time || '-')}</strong></div>
          <div class="status-cell"><span>关注事件</span><strong data-live-field="activity_focus_total">${data.activity.focus.length}</strong></div>
          <div class="status-cell"><span>Breadcrumb</span><strong data-live-field="activity_breadcrumb_count">${data.activity.counts.breadcrumb}</strong></div>
          <div class="status-cell"><span>质量证据</span><strong data-live-field="activity_quality_count">${data.activity.counts.quality}</strong></div>
        </div>
        <h2 style="margin-top:16px">关注流</h2>
        <ol class="activity-list" data-team-activity-focus>${renderActivityEvents(data.activity.focus, true)}</ol>
      </div>
      <div class="panel">
        <p class="eyebrow">Timeline</p>
        <h2>最近活动</h2>
        <ol class="activity-list" data-team-activity-events>${renderActivityEvents(data.activity.events)}</ol>
      </div>
    </section>`;
}

function renderActivityEvents(events: ActivityEvent[], emptyFocus = false): string {
  if (events.length === 0) {
    return emptyFocus
      ? '<li class="ok"><b>暂无关注事件</b><p>当前活动流没有 warning/error 事件。</p></li>'
      : '<li><b>暂无活动</b><p>执行 DocPath 生命周期命令后会生成活动。</p></li>';
  }
  return events.map((event) => {
    const link = event.href ? `<a href="${escapeHtml(event.href)}">打开</a>` : '<span></span>';
    const command = event.command ? `<div class="command-row"><code>${escapeHtml(event.command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(event.command)}">复制</button></div>` : '';
    return `<li class="${escapeHtml(event.severity)}"><div class="activity-head"><b>${escapeHtml(event.label)}</b><span class="severity ${escapeHtml(event.severity)}">${escapeHtml(event.status)}</span>${link}</div><time>${escapeHtml(event.time || '')}</time><p>${escapeHtml(event.detail)}</p>${command}</li>`;
  }).join('');
}

function renderOverviewLayer(data: DashboardData): string {
  const overview = data.overview;
  return `<section id="overview" data-view="overview" class="grid overview-grid view-section">
      <div class="panel overview-primary">
        <p class="eyebrow">Agent Overview</p>
        <h2>工作台总览</h2>
        <div class="status-grid">
          <div class="status-cell"><span>当前步骤</span><strong data-live-field="overview_task">${escapeHtml(overview.task.current_step || '-')}</strong><small>${escapeHtml(overview.task.task_id || '暂无任务 ID')}</small></div>
          <div class="status-cell"><span>项目</span><strong data-live-field="overview_project">${escapeHtml(overview.project_name)}</strong><small>${escapeHtml(`${overview.task.phase} / ${overview.task.gate}`)}</small></div>
          <div class="status-cell"><span>健康</span><strong data-live-field="overview_health">${escapeHtml(overview.health_status.toUpperCase())}</strong></div>
          <div class="status-cell"><span>变更</span><strong data-live-field="overview_changes">${escapeHtml(overview.changes_ready ? 'READY' : 'BLOCKED')}</strong><small><span data-live-field="overview_changes_total">${overview.changes_total}</span> 个文件</small></div>
          <div class="status-cell"><span>交接</span><strong data-live-field="overview_handoff">${escapeHtml(overview.handoff_progress)}</strong></div>
          <div class="status-cell"><span>Backlog</span><strong data-live-field="overview_backlog">${overview.backlog_filtered_total}/${overview.backlog_total}</strong></div>
          <div class="status-cell"><span>Team 活跃</span><strong data-live-field="overview_team_active">${overview.team_active_projects}</strong></div>
        </div>
        <div class="overview-command">
          <p data-live-field="overview_next_action">${escapeHtml(overview.next.action)}</p>
          <div class="command-row"><code data-live-field="overview_next_command">${escapeHtml(overview.next.command)}</code><button class="copy-command" type="button" data-overview-next-copy data-copy-command="${escapeHtml(overview.next.command)}">复制</button></div>
        </div>
      </div>
      <div class="panel">
        <p class="eyebrow">关键入口</p>
        <h2>只读工作流入口</h2>
        <div class="grid overview-links" data-team-overview-links>${renderOverviewLinks(overview.primary_links)}</div>
      </div>
    </section>`;
}

function renderOverviewLinks(items: OverviewSummary['primary_links']): string {
  return items.map((item) => `<a class="overview-link" href="${escapeHtml(item.href)}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.detail)}</small></a>`).join('');
}

function renderWorkbenchMapLayer(data: DashboardData): string {
  const map = data.workbench_map;
  return `<section id="map" data-view="map" class="grid map-grid view-section">
      <div class="panel">
        <p class="eyebrow">Workbench Map</p>
        <h2>工作台地图</h2>
        <div class="status-grid">
          <div class="status-cell"><span>视图</span><strong data-live-field="map_total_views">${map.summary.total_views}</strong></div>
          <div class="status-cell"><span>工作域</span><strong data-live-field="map_group_count">${map.summary.groups}</strong></div>
          <div class="status-cell"><span>主入口</span><strong data-live-field="map_primary_view">${escapeHtml(map.summary.primary_view)}</strong></div>
        </div>
        <div class="overview-command">
          <p>推荐下一步</p>
          <div class="command-row"><code data-live-field="map_recommended_next">${escapeHtml(map.summary.recommended_next)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(map.summary.recommended_next)}">复制</button></div>
        </div>
      </div>
      <div class="panel">
        <p class="eyebrow">Recommended Path</p>
        <h2>推荐路径</h2>
        <ol class="map-path" data-team-map-path>${renderMapPath(map.recommended_path)}</ol>
      </div>
      <div class="grid map-groups" data-team-map-groups>${renderMapGroups(map.groups)}</div>
    </section>`;
}

function renderMapPath(items: WorkbenchMapSummary['recommended_path']): string {
  return items.map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a><small>${escapeHtml(item.reason)}</small></li>`).join('');
}

function renderMapGroups(groups: WorkbenchMapGroup[]): string {
  return groups.map((group) => `<section class="panel map-group"><h2>${escapeHtml(group.label)}</h2><p>${escapeHtml(group.purpose)}</p><ul class="map-view-list">${renderMapViews(group.views)}</ul></section>`).join('');
}

function renderMapViews(views: WorkbenchMapView[]): string {
  return views.map((view) => {
    const severity = view.status === 'blocked' ? 'error' : view.status === 'attention' ? 'warning' : 'ok';
    return `<li class="${escapeHtml(view.status)}"><div class="signal-head"><a href="${escapeHtml(view.href)}">${escapeHtml(view.label)}</a><span class="severity ${severity}">${escapeHtml(view.status)}</span></div><p>${escapeHtml(view.role)}</p><small>${escapeHtml(view.detail)}</small></li>`;
  }).join('');
}

function renderAppChrome(data: DashboardData): string {
  return `<div class="appbar"><div class="brand">${escapeHtml(data.workspace.product)}</div><div>${renderWorkspaceNav(data)}${renderWorkbenchControls(data)}</div></div>
    <header><div><p class="eyebrow">本地只读 · Agent 工作台</p><h1 data-live-field="task_title">${escapeHtml(data.current.task_title)}</h1></div><p class="meta">生成时间<br><span data-live-field="generated_at">${escapeHtml(data.generated_at)}</span></p></header>`;
}

function renderWorkbenchControls(data: DashboardData): string {
  return `<div class="workbench-controls" aria-label="工作台控制">${renderCommandPalette(data)}<button class="icon-button" type="button" data-refresh title="刷新只读数据">刷新</button><span class="sync-status" data-sync-status>只读数据 · <span data-live-field="generated_at">${escapeHtml(data.generated_at)}</span></span></div>`;
}

function renderCommandPalette(data: DashboardData): string {
  const payload = escapeHtml(JSON.stringify(data.command_palette));
  return `<div class="palette" data-command-palette data-palette-items="${payload}"><input class="palette-input" type="search" placeholder="搜索视图、命令、项目" aria-label="Command Palette" data-palette-input><div class="palette-results" data-palette-results></div></div>`;
}

function renderActionCenter(data: DashboardData): string {
  const groups = data.action_center.groups.map((group) => `<section class="panel action-group"><h2>${escapeHtml(group.title)}</h2>${group.items.map(renderActionItem).join('')}</section>`).join('');
  return `<section id="actions" data-view="actions" data-action-center class="grid actions-grid view-section">${groups}</section>`;
}

function renderActionItem(item: ActionItem): string {
  const target = item.href ? `<a href="${escapeHtml(item.href)}">打开视图</a>` : '<span></span>';
  return `<article class="action-card ${escapeHtml(item.emphasis)}">
    <header><b>${escapeHtml(item.label)}</b>${target}</header>
    <p>${escapeHtml(item.description)}</p>
    <div class="command-row"><code>${escapeHtml(item.command)}</code><button class="copy-command" type="button" data-copy-command="${escapeHtml(item.command)}">复制</button></div>
  </article>`;
}

function renderWorkflowSummary(data: DashboardData): string {
  const completed = data.plan.filter((item) => item.done).length;
  const planTotal = data.plan.length;
  return `<section id="workflow" data-view="workflow" class="grid metrics view-section">
      ${renderLiveMetric('当前阶段', data.current.phase, 'phase', `gate: ${data.current.gate}`, 'gate')}
      ${renderLiveMetric('当前步骤', data.current.current_step || '-', 'current_step', data.current.task_id)}
      ${renderMetric('Plan 进度', `${completed}/${planTotal}`, data.breadcrumb.blocked > 0 ? `${data.breadcrumb.blocked} 个阻塞记录` : '无阻塞记录')}
      ${renderLiveMetric('Backlog', `${data.backlog.total}`, 'backlog_total', Object.entries(data.backlog.by_status).map(([k, v]) => `${k}:${v}`).join(' · '))}
    </section>`;
}

function renderDashboardLowerLayout(data: DashboardData): string {
  return `<section class="grid layout view-section" data-view="evidence" style="margin-top:16px">
      <div class="stack">
        <section class="panel"><h2>Breadcrumb 时间线</h2><ol class="timeline">${renderTimeline(data)}</ol></section>
        <section class="panel"><h2>项目目录</h2><table><thead><tr><th>项目</th><th>技术</th><th>状态</th><th>路径</th></tr></thead><tbody>${renderProjectDirectoryRows(data)}</tbody></table></section>
        ${renderBacklogBoard(data)}
      </div>
      <aside class="stack">
        <section class="panel"><h2>Next Action</h2><div class="next"><p>${escapeHtml(data.next.action)}</p><p><code>${escapeHtml(data.next.command)}</code></p></div></section>
        <section class="panel"><h2>Plan 步骤</h2><ol class="steps">${renderPlan(data)}</ol></section>
        ${renderEvidence(data)}
      </aside>
    </section>`;
}

function renderWorkspaceNav(data: DashboardData): string {
  const items = data.workspace.navigation
    .map((item) => `<a href="${escapeHtml(item.href)}" data-view-link="${escapeHtml(item.id)}">${escapeHtml(item.label)}</a>`)
    .join('');
  return `<nav aria-label="工作台视图">${items}</nav>`;
}

function renderTeamLayer(data: DashboardData): string {
  return `<section id="team" data-view="team" class="grid team-grid view-section">
      ${renderTeamOverviewPanel(data.team)}
      ${renderTeamActivityPanel(data.team)}
      ${renderTeamPortfolioPanel(data)}
      ${renderTeamFocusPanel(data.team)}
      ${renderTeamDeliveryPanel(data.team)}
      ${renderTeamNextPanel(data.team)}
      ${renderTeamWorkflowPanel(data.team)}
      ${renderTeamDistributionPanels(data.team)}
    </section>`;
}

function renderTeamOverviewPanel(team: TeamSummary): string {
  return `<div class="panel">
    <p class="eyebrow">Team 视角</p>
    <h2>跨项目总览</h2>
    <div class="status-grid">
      <div class="status-cell"><span>注册项目</span><strong data-live-field="team_total_projects">${team.total_projects}</strong></div>
      <div class="status-cell"><span>活跃项目</span><strong data-live-field="team_active_projects">${team.active_projects}</strong></div>
      <div class="status-cell"><span>需要关注</span><strong data-live-field="team_attention_projects">${team.attention_projects}</strong></div>
      <div class="status-cell"><span>阶段种类</span><strong data-live-field="team_phase_count">${Object.keys(team.by_phase).length}</strong><small data-live-field="team_phase_inline">${escapeHtml(renderCountInline(team.by_phase))}</small></div>
      <div class="status-cell"><span>技术栈种类</span><strong data-live-field="team_stack_count">${Object.keys(team.by_stack).length}</strong><small data-live-field="team_stack_inline">${escapeHtml(renderCountInline(team.by_stack))}</small></div>
    </div>
  </div>`;
}

function renderTeamActivityPanel(team: TeamSummary): string {
  return `<div class="panel">
    <h2>Team 项目动态</h2>
    <div class="split-list">
      <div><p class="eyebrow">最近项目</p><ul class="mini-list" data-team-recent-projects>${renderProjectMiniList(team.recent_projects)}</ul></div>
      <div><p class="eyebrow">需要关注</p><ul class="mini-list" data-team-attention-items>${renderProjectMiniList(team.attention_items)}</ul></div>
    </div>
  </div>`;
}

function renderTeamPortfolioPanel(data: DashboardData): string {
  return `<div class="panel team-portfolio">
    <p class="eyebrow">Team Portfolio</p>
    <h2>项目组合矩阵</h2>
    <table class="team-portfolio-table"><thead><tr><th>项目</th><th>健康</th><th>阶段</th><th>当前任务</th><th>下一步</th><th>最近同步</th></tr></thead><tbody data-team-portfolio>${renderTeamPortfolioRows(data)}</tbody></table>
  </div>`;
}

function renderTeamFocusPanel(team: TeamSummary): string {
  return `<div class="panel team-wide">
    <p class="eyebrow">Team Focus</p>
    <h2>关注优先级</h2>
    <div class="grid team-layers" data-team-health-layers>${renderTeamHealthLayers(team.health_layers)}</div>
  </div>`;
}

function renderTeamDeliveryPanel(team: TeamSummary): string {
  return `<div class="panel team-wide">
    <p class="eyebrow">Team Delivery</p>
    <h2>交付协作摘要</h2>
    <div class="grid team-delivery" data-team-delivery-groups>${renderTeamDeliveryGroups(team.delivery_groups)}</div>
  </div>`;
}

function renderTeamNextPanel(team: TeamSummary): string {
  return `<div class="panel team-wide">
    <p class="eyebrow">Next Queue</p>
    <h2>跨项目下一步</h2>
    <div class="team-queue" data-team-next-queue>${renderTeamNextQueue(team.next_queue)}</div>
  </div>`;
}

function renderTeamWorkflowPanel(team: TeamSummary): string {
  return `<div class="panel team-wide">
    <p class="eyebrow">Workflow Lanes</p>
    <h2>阶段推进泳道</h2>
    <div class="grid phase-lanes" data-team-phase-lanes>${renderTeamPhaseLanes(team.phase_lanes)}</div>
  </div>`;
}

function renderTeamDistributionPanels(team: TeamSummary): string {
  return `<div class="grid distribution-grid">
    <section class="panel"><h2>阶段分布</h2><ul class="distribution-list" data-team-phase-distribution>${renderTeamDistribution(team.projects_by_phase)}</ul></section>
    <section class="panel"><h2>技术栈分布</h2><ul class="distribution-list" data-team-stack-distribution>${renderTeamDistribution(team.projects_by_stack)}</ul></section>
  </div>`;
}

function renderCountInline(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, value]) => `${key}:${value}`).join(' · ') || '暂无';
}

function renderProjectMiniList(projects: RegisteredProject[]): string {
  return projects.length > 0
    ? projects.map((project) => `<li><b>${escapeHtml(project.name)}</b><small>${escapeHtml(`${project.phase} / ${project.gate} · ${project.root}`)}</small></li>`).join('')
    : '<li><b>暂无</b><small>没有匹配项目</small></li>';
}

function renderTeamPortfolioRows(data: DashboardData): string {
  return data.team.portfolio.length > 0
    ? data.team.portfolio.map((project) => `<tr>
      <td><a href="${escapeHtml(project.href)}">${escapeHtml(project.name)}</a><small>${escapeHtml(project.stack)}</small></td>
      <td><span class="health-dot ${escapeHtml(project.health)}"></span>${escapeHtml(project.health)}</td>
      <td>${escapeHtml(project.phase)}<small>${escapeHtml(project.gate)}</small></td>
      <td><b>${escapeHtml(project.task_id || '-')}</b><small>${escapeHtml(project.task_title || '暂无当前任务')}</small></td>
      <td>${escapeHtml(project.next_action)}</td>
      <td><small>${escapeHtml(project.last_seen_at || '-')}</small></td>
    </tr>`).join('')
    : '<tr><td colspan="6">暂无注册项目</td></tr>';
}

function renderTeamHealthLayers(layers: TeamHealthLayer[]): string {
  return layers.map((layer) => `<article class="team-layer">
    <header><b><span class="health-dot ${escapeHtml(layer.severity)}"></span>${escapeHtml(layer.label)}</b><strong>${layer.count}</strong></header>
    <ul>${layer.projects.length > 0
      ? layer.projects.map((project) => `<li><a href="${escapeHtml(project.href)}">${escapeHtml(project.name)}</a><small>${escapeHtml(`${project.phase} / ${project.gate} · ${project.next_action}`)}</small></li>`).join('')
      : '<li><small>暂无项目</small></li>'}</ul>
  </article>`).join('');
}

function renderTeamNextQueue(items: TeamNextQueueItem[]): string {
  return items.length > 0
    ? items.map((item) => `<article class="team-queue-item">
      <header><a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a><span class="severity ${escapeHtml(item.health)}">${escapeHtml(item.health)}</span></header>
      <b>${escapeHtml(item.next_action)}</b>
      <small>${escapeHtml(`${item.phase} / ${item.gate} · ${item.task_id || '-'} ${item.task_title || ''}`.trim())}</small>
    </article>`).join('')
    : '<article class="team-queue-item"><b>暂无</b><small>没有已注册项目</small></article>';
}

function renderTeamDeliveryGroups(groups: TeamDeliveryGroup[]): string {
  return groups.length > 0
    ? groups.map((group) => `<article class="team-delivery-group">
      <header><b>${escapeHtml(group.label)}</b><strong>${group.count}</strong></header>
      <p>${escapeHtml(group.description)}</p>
      <ul>${group.projects.length > 0
        ? group.projects.map((project) => `<li><a href="${escapeHtml(project.href)}">${escapeHtml(project.name)}</a><span class="severity ${escapeHtml(project.health)}">${escapeHtml(project.health)}</span><small>${escapeHtml(`${project.phase} / ${project.gate} · ${project.task_id || '-'} · ${project.next_action}`)}</small></li>`).join('')
        : '<li><small>暂无项目</small></li>'}</ul>
    </article>`).join('')
    : '<article class="team-delivery-group"><header><b>暂无</b><strong>0</strong></header><p>没有可展示项目</p><ul><li><small>暂无项目</small></li></ul></article>';
}

function renderTeamPhaseLanes(lanes: TeamPhaseLane[]): string {
  return lanes.length > 0
    ? lanes.map((lane) => `<article class="phase-lane">
      <header><b>${escapeHtml(lane.phase)}</b><strong>${lane.count}</strong></header>
      <ul>${lane.projects.map((project) => `<li><a href="${escapeHtml(project.href)}">${escapeHtml(project.name)}</a><small>${escapeHtml(`${project.gate} · ${project.task_id || '-'} · ${project.next_action}`)}</small></li>`).join('')}</ul>
    </article>`).join('')
    : '<article class="phase-lane"><header><b>暂无</b><strong>0</strong></header><small>没有可展示项目</small></article>';
}

function renderTeamDistribution(groups: TeamDistributionGroup[]): string {
  return groups.length > 0
    ? groups.map((group) => `<li><b><span>${escapeHtml(group.key)}</span><span>${group.count}</span></b><small>${escapeHtml(group.projects.map((project) => `${project.name}(${project.phase}/${project.gate})`).join(' · '))}</small></li>`).join('')
    : '<li><b><span>暂无</span><span>0</span></b><small>没有可展示项目</small></li>';
}

function renderProjectLayer(data: DashboardData): string {
  const install = data.project.install_health;
  const installText = install
    ? `${install.passed ? '通过' : '需处理'} · ${install.errors} 错误 · ${install.warnings} 警告`
    : '暂无 install health';
  return `<section id="project" data-view="project" class="grid project-grid view-section">
      <div class="panel">
        <div class="project-title"><div><p class="eyebrow">项目层级</p><strong>${escapeHtml(data.project.name)}</strong></div><p>${escapeHtml(data.project.type)}</p></div>
        <dl class="project-kv">
          <dt>语言</dt><dd>${escapeHtml(data.project.language)}</dd>
          <dt>框架</dt><dd>${escapeHtml(data.project.framework)}</dd>
          <dt>根目录</dt><dd>${escapeHtml(data.project.root)}</dd>
          <dt>DocPath</dt><dd>${escapeHtml(data.project.docpath_dir)}</dd>
        </dl>
        ${renderSelectedProject(data)}
      </div>
      <div class="panel">
        <h2>项目总览</h2>
        <div class="status-grid">
          <div class="status-cell"><span>任务目录</span><strong>${data.project.task_dirs}</strong></div>
          <div class="status-cell"><span>Backlog</span><strong>${data.project.backlog_total}</strong></div>
          <div class="status-cell"><span>注册项目</span><strong>${data.registry.total}</strong></div>
          <div class="status-cell"><span>Lesson 待固化</span><strong>${data.project.lesson_pending_count}</strong></div>
          <div class="status-cell"><span>Install Health</span><strong>${escapeHtml(install?.passed ? 'PASS' : install ? 'FAIL' : '-')}</strong><small>${escapeHtml(installText)}</small></div>
          <div class="status-cell"><span>Backlog 状态</span><strong>${escapeHtml(Object.keys(data.project.backlog_by_status).length.toString())}</strong><small>${escapeHtml(Object.entries(data.project.backlog_by_status).map(([k, v]) => `${k}:${v}`).join(' · ') || '暂无')}</small></div>
          <div class="status-cell"><span>推荐修复</span><strong>${escapeHtml(install?.recommended_command || '-')}</strong></div>
        </div>
      </div>
    </section>`;
}

function renderSelectedProject(data: DashboardData): string {
  const selected = data.selected_project;
  if (!selected.project) {
    return `<div class="selected-project"><strong>${escapeHtml(selected.message)}</strong>${selected.requested ? `<small>请求: ${escapeHtml(selected.requested)}</small>` : ''}</div>`;
  }
  const tech = projectStack(selected.project);
  return `<div class="selected-project">
    <strong>${escapeHtml(selected.project.name)}</strong>
    <small>${escapeHtml(`${selected.project.phase} / ${selected.project.gate} · ${tech}`)}</small>
    <small>${escapeHtml(selected.project.root)}</small>
  </div>`;
}

function renderTaskDetail(data: DashboardData): string {
  const detail = data.task_detail;
  return `<section id="task" data-view="task" class="grid task-grid view-section">
    <div class="panel">
      <p class="eyebrow">Task Detail</p>
      <h2>${escapeHtml(detail.title)}</h2>
      <div class="status-grid">
        <div class="status-cell"><span>任务</span><strong>${escapeHtml(detail.task_id || '-')}</strong></div>
        <div class="status-cell"><span>阶段</span><strong>${escapeHtml(detail.phase)}</strong><small>${escapeHtml(detail.gate)}</small></div>
        <div class="status-cell"><span>步骤</span><strong>${detail.progress.done_steps}/${detail.progress.total_steps}</strong><small>${detail.progress.blocked_entries} 个阻塞</small></div>
      </div>
      <div class="next" style="margin-top:14px"><p>${escapeHtml(detail.next_action.action)}</p><p><code>${escapeHtml(detail.next_action.command)}</code></p></div>
      <ol class="timeline" style="margin-top:14px">${renderTaskStepDetails(detail)}</ol>
    </div>
    <div class="panel">
      <h2>流程节点详情</h2>
      <div class="task-flow">${renderTaskFlowNodes(detail)}</div>
    </div>
  </section>`;
}

function renderTaskStepDetails(detail: TaskDetail): string {
  return detail.steps.length > 0
    ? detail.steps.map((step) => `<li class="${escapeHtml(step.breadcrumb_status || (step.done ? 'done' : ''))}"><b>${escapeHtml(step.id)} ${escapeHtml(step.title)}</b><time>${escapeHtml(step.breadcrumb_time || '')}</time><p>${escapeHtml(step.breadcrumb_context || (step.done ? '已完成' : '暂无 breadcrumb 证据'))}</p></li>`).join('')
    : '<li><b>暂无计划步骤</b><p>生成 plan 后会显示步骤详情。</p></li>';
}

function renderTaskFlowNodes(detail: TaskDetail): string {
  return detail.flow_nodes.map((node) => `<div class="task-node ${node.active ? 'active' : node.complete ? 'complete' : ''}"><b>${escapeHtml(node.label)}</b><small>${escapeHtml(node.summary)}</small></div>`).join('');
}

const CHANGE_GROUP_LABELS: Record<keyof ChangesReport['groups'], string> = {
  source: '源码',
  tests: '测试',
  docpath: 'DocPath 运行态',
  templates_docs: '模板/文档',
  other: '其他',
};

function renderChangesLayer(data: DashboardData): string {
  const changes = data.changes;
  return `<section id="changes" data-view="changes" class="grid changes-grid view-section">
    <div class="panel">
      <p class="eyebrow">Changes</p>
      <h2>变更收口</h2>
      <div class="status-grid">
        <div class="status-cell"><span>Git</span><strong data-live-field="changes_available">${escapeHtml(changes.available ? '可用' : '不可用')}</strong><small data-live-field="changes_error">${escapeHtml(changes.error || '')}</small></div>
        <div class="status-cell"><span>提交状态</span><strong data-live-field="changes_ready">${escapeHtml(changes.ready_to_commit ? 'READY' : 'BLOCKED')}</strong></div>
        <div class="status-cell"><span>变更文件</span><strong data-live-field="changes_total">${changes.counts.total}</strong></div>
        <div class="status-cell"><span>Staged</span><strong data-live-field="changes_staged">${changes.counts.staged}</strong></div>
        <div class="status-cell"><span>Unstaged</span><strong data-live-field="changes_unstaged">${changes.counts.unstaged}</strong></div>
        <div class="status-cell"><span>Untracked</span><strong data-live-field="changes_untracked">${changes.counts.untracked}</strong></div>
      </div>
      <code class="commit-message" data-live-field="changes_commit_message">${escapeHtml(changes.suggested_commit_message || '-')}</code>
    </div>
    <div class="panel">
      <h2>收口阻塞</h2>
      <p>分支: <span data-live-field="changes_branch">${escapeHtml(changes.branch)}</span></p>
      <ul class="change-blockers" data-team-changes-blockers>${renderChangesBlockers(changes)}</ul>
    </div>
    <div class="grid changes-groups" data-team-changes-groups>${renderChangeGroups(changes)}</div>
  </section>`;
}

function renderChangesBlockers(changes: DashboardChanges): string {
  return changes.blocking_reasons.length > 0
    ? changes.blocking_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')
    : '<li>没有阻塞项</li>';
}

function renderChangeGroups(changes: DashboardChanges): string {
  return (Object.keys(CHANGE_GROUP_LABELS) as Array<keyof ChangesReport['groups']>).map((key) => {
    const files = changes.groups[key] || [];
    const rows = files.length > 0 ? files.slice(0, 8).map((file) => `<li>${escapeHtml(file)}</li>`).join('') : '<li>暂无变更</li>';
    return `<article class="change-group"><header><b>${escapeHtml(CHANGE_GROUP_LABELS[key])}</b><strong>${files.length}</strong></header><ul>${rows}</ul></article>`;
  }).join('');
}

function renderHandoffLayer(data: DashboardData): string {
  const handoff = data.handoff;
  return `<section id="handoff" data-view="handoff" class="grid handoff-grid view-section">
    <div class="panel">
      <p class="eyebrow">Handoff</p>
      <h2>交接准备</h2>
      <div class="status-grid">
        <div class="status-cell"><span>进度</span><strong data-live-field="handoff_progress">${handoff.progress.done}/${handoff.progress.total}</strong></div>
        <div class="status-cell"><span>阻塞</span><strong data-live-field="handoff_blocked">${handoff.progress.blocked}</strong></div>
        <div class="status-cell"><span>Check</span><strong data-live-field="handoff_check">${escapeHtml(handoff.evidence.check)}</strong></div>
        <div class="status-cell"><span>Review</span><strong data-live-field="handoff_review">${escapeHtml(handoff.evidence.review)}</strong></div>
      </div>
      <h2 style="margin-top:14px">交接命令</h2>
      <ul class="handoff-commands" data-team-handoff-commands>${renderHandoffCommands(handoff)}</ul>
    </div>
    <div class="panel">
      <h2>恢复协议</h2>
      <ul class="handoff-list" data-team-handoff-protocol>${handoff.resume_protocol.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
    </div>
    <div class="panel">
      <h2>必读文件</h2>
      <ul class="handoff-list" data-team-handoff-files>${handoff.required_files.map((file) => `<li>${escapeHtml(file)}</li>`).join('')}</ul>
    </div>
    <div class="panel">
      <h2>最近 Breadcrumb</h2>
      <ul class="handoff-list" data-team-handoff-breadcrumbs>${renderHandoffBreadcrumbs(handoff)}</ul>
    </div>
  </section>`;
}

function renderHandoffCommands(handoff: HandoffSummary): string {
  return handoff.commands.map((item) => `<li><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.description)}</small><code>${escapeHtml(item.command)}</code></li>`).join('');
}

function renderHandoffBreadcrumbs(handoff: HandoffSummary): string {
  return handoff.recent_breadcrumbs.length > 0
    ? handoff.recent_breadcrumbs.map((entry) => `<li><b>${escapeHtml(entry.step)}</b><small>${escapeHtml(`${entry.status} · ${entry.context}`)}</small></li>`).join('')
    : '<li>暂无 breadcrumb</li>';
}

function renderDocumentPreviews(data: DashboardData): string {
  const previews = data.document_previews.map((preview) => `<article class="panel doc-preview">
    <header><p class="eyebrow">${escapeHtml(preview.id)}</p><h2>${escapeHtml(preview.title)}</h2><p>${escapeHtml(preview.summary)} · ${preview.line_count} 行</p><small>${escapeHtml(preview.path)}</small></header>
    ${preview.exists ? `<pre>${escapeHtml(preview.excerpt)}</pre>` : '<div class="missing">暂无可预览内容</div>'}
  </article>`).join('');
  return `<section id="documents" data-view="documents" class="grid documents-grid view-section">${previews}</section>`;
}

function renderHealthLayer(data: DashboardData): string {
  return `<section id="health" data-view="health" class="grid health-grid view-section">
      <div class="panel health-score">
        <p class="eyebrow">Health</p>
        <h2>工作台健康</h2>
        <div class="health-badge ${escapeHtml(data.health.status)}" data-live-field="health_status">${escapeHtml(data.health.status.toUpperCase())}</div>
        <div class="status-grid">
          <div class="status-cell"><span>正常</span><strong data-live-field="health_ok">${data.health.ok}</strong></div>
          <div class="status-cell"><span>关注</span><strong data-live-field="health_warning">${data.health.warning}</strong></div>
          <div class="status-cell"><span>阻塞</span><strong data-live-field="health_error">${data.health.error}</strong></div>
        </div>
      </div>
      <div class="panel">
        <h2>关注队列</h2>
        <ul class="signal-list">${renderHealthSignals(data.health.attention_queue.length > 0 ? data.health.attention_queue : data.health.signals)}</ul>
      </div>
    </section>`;
}

function renderHealthSignals(signals: HealthSignal[]): string {
  return signals.map((signal) => `<li>
    <div class="signal-head"><b>${escapeHtml(signal.label)}</b><span class="severity ${escapeHtml(signal.severity)}">${escapeHtml(signal.severity)}</span></div>
    <p>${escapeHtml(signal.summary)}</p>
    <small>${escapeHtml(signal.detail)}</small>
  </li>`).join('');
}

function renderProjectDirectoryRows(data: DashboardData): string {
  return data.project_directory.length > 0
    ? data.project_directory.slice(0, 12).map((project) => {
      const tech = [project.type, project.language, project.framework].filter((item) => item && item !== '-').join(' / ') || '-';
      return `<tr class="${project.selected ? 'selected-row' : ''}"><td><a class="project-link" href="${escapeHtml(project.href)}">${escapeHtml(project.name)}</a></td><td>${escapeHtml(tech)}</td><td>${escapeHtml(`${project.phase} / ${project.gate}`)}</td><td>${escapeHtml(project.root)}</td></tr>`;
    }).join('')
    : '<tr><td colspan="4">暂无注册项目。运行 docpath init 后会自动注册。</td></tr>';
}

function renderFlow(data: DashboardData): string {
  return data.flow.map((item) =>
    `<li class="${item.active ? 'active' : item.complete ? 'complete' : ''}"><span></span>${escapeHtml(item.label)}</li>`
  ).join('');
}

function renderTimeline(data: DashboardData): string {
  return data.breadcrumb.entries.length > 0
    ? data.breadcrumb.entries.map((entry) =>
      `<li class="${escapeHtml(entry.status)}"><b>${escapeHtml(entry.step)}</b><time>${escapeHtml(entry.timestamp || '')}</time><p>${escapeHtml(entry.context || entry.status)}</p></li>`
    ).join('')
    : '<li><b>暂无记录</b><p>执行 DocPath 生命周期命令后会生成 breadcrumb。</p></li>';
}

function renderPlan(data: DashboardData): string {
  return data.plan.length > 0
    ? data.plan.map((item) => `<li class="${item.done ? 'done' : ''}"><span>${item.done ? '✓' : ''}</span>${escapeHtml(item.id)} ${escapeHtml(item.title)}</li>`).join('')
    : '<li><span></span>暂无 plan 步骤</li>';
}

function backlogFilterHref(next: Partial<DashboardData['backlog']['filters']>): string {
  const params = new URLSearchParams();
  const status = next.status ?? null;
  const priority = next.priority ?? null;
  const q = next.q ?? null;
  if (status) params.set('status', status);
  if (priority) params.set('priority', priority);
  if (q) params.set('q', q);
  const query = params.toString();
  return `${query ? `/?${query}` : '/'}#backlog`;
}

function renderBacklogFilterBar(data: DashboardData): string {
  const filters = data.backlog.filters;
  const statusLinks = ['active', 'accepted', 'proposed', 'planned', 'done']
    .map((status) => `<a class="${filters.status === status ? 'active' : ''}" href="${escapeHtml(backlogFilterHref({ ...filters, status }))}">${escapeHtml(status)}</a>`)
    .join('');
  const priorityLinks = ['P0', 'P1', 'P2', 'P3']
    .map((priority) => `<a class="${filters.priority === priority ? 'active' : ''}" href="${escapeHtml(backlogFilterHref({ ...filters, priority }))}">${escapeHtml(priority)}</a>`)
    .join('');
  const reset = `<a href="/#backlog">全部</a>`;
  const q = filters.q ? `<span class="filter-pill">搜索: ${escapeHtml(filters.q)}</span>` : '';
  return `<div class="filter-bar">${reset}${statusLinks}${priorityLinks}${q}</div>`;
}

function renderBacklogBoard(data: DashboardData): string {
  const groups = data.backlog.groups.length > 0
    ? data.backlog.groups.map((group) => `<div class="board-column"><h3>${escapeHtml(group.status)}<span>${group.count}</span></h3>${renderBacklogCards(group.items)}</div>`).join('')
    : '<div class="board-column"><h3>无匹配项<span>0</span></h3><p>当前筛选没有匹配的 backlog。</p></div>';
  return `<section id="backlog" data-view="backlog" class="panel view-section">
    <h2>Backlog Board</h2>
    <p aria-label="${data.backlog.filtered_total}/${data.backlog.total} 条匹配"><span data-live-field="backlog_filtered_total">${data.backlog.filtered_total}</span>/<span data-live-field="backlog_total">${data.backlog.total}</span> 条匹配</p>
    ${renderBacklogFilterBar(data)}
    <div class="board">${groups}</div>
  </section>`;
}

function renderBacklogCards(items: DashboardData['backlog']['filtered_items']): string {
  return items.length > 0
    ? items.map((item) => `<div class="backlog-card"><b>${escapeHtml(item.id)} ${escapeHtml(item.title)}</b><small>${escapeHtml(`${item.priority} · L${item.level}${item.task ? ` · ${item.task}` : ''}`)}</small></div>`).join('')
    : '<p>暂无条目</p>';
}

function renderBacklogRows(data: DashboardData): string {
  return data.backlog.items.length > 0
    ? data.backlog.items.map((item) =>
      `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(item.priority)}</td><td>L${item.level}</td></tr>`
    ).join('')
    : '<tr><td colspan="5">暂无 backlog 条目</td></tr>';
}

function renderEvidence(data: DashboardData): string {
  const checkItems = data.evidence.check.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<section id="evidence" data-view="evidence" class="panel view-section"><h2>Check / Review</h2><p>${escapeHtml(data.evidence.check.result)}</p><p>${escapeHtml(data.evidence.review.result)}</p>${checkItems ? `<ul class="evidence">${checkItems}</ul>` : ''}</section>`;
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

async function handleRequest(cwd: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname;
    if (path === '/favicon.ico') {
      send(res, 204, 'image/x-icon', '');
      return;
    }
    const data = await buildDashboardData(cwd, {
      project: url.searchParams.get('project'),
      root: url.searchParams.get('root'),
      status: url.searchParams.get('status'),
      priority: url.searchParams.get('priority'),
      q: url.searchParams.get('q'),
    });
    if (path === '/api/state') {
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(data, null, 2));
      return;
    }
    if (path === '/' || path === '/index.html') {
      send(res, 200, 'text/html; charset=utf-8', renderDashboardHtml(data));
      return;
    }
    send(res, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (err) {
    send(res, 500, 'text/plain; charset=utf-8', err instanceof Error ? err.message : String(err));
  }
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const selection = { project: options.project, root: options.root, status: options.status, priority: options.priority, q: options.q };
  if (options.json) {
    console.log(JSON.stringify(await buildDashboardData(options.cwd, selection), null, 2));
    return;
  }

  if (options.print) {
    console.log(renderDashboardHtml(await buildDashboardData(options.cwd, selection)));
    return;
  }

  const host = options.host || DEFAULT_DASHBOARD_HOST;
  const port = options.port ?? DEFAULT_DASHBOARD_PORT;
  const server = createServer((req, res) => {
    void handleRequest(options.cwd, req, res);
  });
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`DocPath dashboard: http://${host}:${actualPort}`);
    console.log('只读模式：页面不会修改 DocPath 状态。按 Ctrl+C 停止。');
  });
}
