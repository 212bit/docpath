import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Compass,
  FolderKanban,
  GitBranch,
  Layers3,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { DashboardData } from './types.js';

type SidebarView = {
  id: string;
  label: string;
  detail: string;
  icon: typeof Compass;
};

export const globalViews: SidebarView[] = [
  { id: 'projects', label: 'Projects', detail: '项目空间', icon: FolderKanban },
  { id: 'team', label: 'Teams', detail: '团队驾驶舱', icon: Users },
  { id: 'settings', label: 'Settings', detail: '全局配置', icon: Settings },
] as const;

export const projectViews: SidebarView[] = [
  { id: 'overview', label: 'Overview', detail: '总览', icon: Compass },
  { id: 'workflow', label: 'Workflow', detail: 'FSM 流程', icon: GitBranch },
  { id: 'backlog', label: 'Backlog', detail: '待办看板', icon: FolderKanban },
  { id: 'changes', label: 'Changes', detail: '代码变更', icon: GitBranch },
  { id: 'handoff', label: 'Handoff', detail: '任务交接', icon: ShieldCheck },
  { id: 'documents', label: 'Docs', detail: '文档中心', icon: ClipboardList },
  { id: 'session', label: 'Session', detail: '会话恢复', icon: Layers3 },
  { id: 'activity', label: 'Activity', detail: '动态时间线', icon: Activity },
] as const;

export const compatibilityViews = [
  { id: 'overview', label: '工作台总览', icon: Compass },
  { id: 'map', label: '工作台地图', icon: Compass },
  { id: 'session', label: '会话恢复', icon: Layers3 },
  { id: 'readiness', label: '收口审计', icon: ShieldCheck },
  { id: 'audit', label: '完成度审计', icon: ClipboardList },
  { id: 'docs-index', label: '文档索引', icon: ClipboardList },
  { id: 'settings', label: '系统配置', icon: Settings },
  { id: 'activity', label: '最近活动', icon: Activity },
  { id: 'team', label: '团队驾驶舱', icon: Users },
  { id: 'actions', label: '行动中心', icon: CheckCircle2 },
  { id: 'project', label: '项目详情', icon: FolderKanban },
  { id: 'task', label: '任务详情', icon: ClipboardList },
  { id: 'changes', label: '代码变更', icon: GitBranch },
  { id: 'handoff', label: '交接审计', icon: ShieldCheck },
  { id: 'documents', label: '工作流文档', icon: ClipboardList },
  { id: 'health', label: '健康检查', icon: ShieldCheck },
  { id: 'workflow', label: 'FSM 流程', icon: GitBranch },
  { id: 'evidence', label: '证据', icon: ClipboardList },
  { id: 'backlog', label: '工作待办', icon: FolderKanban },
] as const;

const knownViewIds = new Set(['projects', ...compatibilityViews.map((view) => view.id)]);
export const projectViewIds = new Set(projectViews.map((view) => view.id));

function splitHash(hash: string): { view: string; query: string } {
  const raw = hash.replace(/^#/, '');
  const [view, query = ''] = raw.split('?');
  return { view, query };
}

export function viewFromHash(): string {
  if (typeof window === 'undefined') return 'projects';
  const { view } = splitHash(window.location.hash);
  return knownViewIds.has(view) ? view : 'projects';
}

export function rootFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const { query } = splitHash(window.location.hash);
  return new URLSearchParams(query).get('root');
}

export function projectViewHref(view: string, root: string | null): string {
  return root && projectViewIds.has(view) ? `#${view}?root=${encodeURIComponent(root)}` : `#${view}`;
}

export function projectDirectoryHealth(project: { selected: boolean; phase: string; gate: string }, data: DashboardData): string {
  if (project.selected) return data.health.status;
  if (project.gate.endsWith('_fail')) return 'error';
  if (!['completed', 'idle'].includes(project.phase)) return 'warning';
  return 'ok';
}

function SidebarLink({ view, activeView, href }: { view: SidebarView; activeView: string; href?: string }) {
  const Icon = view.icon;
  const active = activeView === view.id;
  return <a
    href={href || `#${view.id}`}
    className={active ? 'active' : undefined}
    data-sidebar-link={view.id}
    aria-current={active ? 'page' : undefined}
  >
    <Icon size={16} aria-hidden="true" />
    <span>{view.label}<small>{view.detail}</small></span>
  </a>;
}

export function DashboardSidebar({ data, activeView }: { data: DashboardData; activeView: string }) {
  const projectLevel = projectViewIds.has(activeView);
  const activeProject = data.project;
  const activeRoot = data.selected_project.project?.root || data.project.root;
  return <aside className="react-sidebar" data-primary-navigation="desktop" data-sidebar-level={projectLevel ? 'project' : 'global'} aria-label="Primary Workbench Navigation">
    <div className="react-sidebar-project" hidden={!projectLevel}>
      <a href="#projects" className="react-back-link" data-back-to-projects>
        <ArrowLeft size={16} aria-hidden="true" />Back to Projects
      </a>
      <div className="react-sidebar-status">
        <p className="react-eyebrow">Workbench Focus</p>
        <strong>{activeProject.name}</strong>
        <small>{data.current.phase} / {data.current.gate} · {data.health.status}</small>
      </div>
    </div>
    <div className="react-sidebar-status" hidden={projectLevel}>
      <p className="react-eyebrow">Overall Management</p>
      <strong>Global</strong>
      <small>{data.registry.total} registered projects · {data.health.status}</small>
    </div>
    <nav className="react-sidebar-nav" aria-label="Global Level Sidebar Menu" hidden={projectLevel}>
      {globalViews.map((view) => <SidebarLink key={view.id} view={view} activeView={activeView} />)}
    </nav>
    <nav className="react-sidebar-nav" aria-label="Project Level Sidebar Menu" hidden={!projectLevel}>
      {projectViews.map((view) => <SidebarLink key={view.id} view={view} activeView={activeView} href={projectViewHref(view.id, activeRoot)} />)}
    </nav>
  </aside>;
}

export function MobileNavigation({ data, activeView }: { data: DashboardData; activeView: string }) {
  const projectLevel = projectViewIds.has(activeView);
  const activeRoot = data.selected_project.project?.root || data.project.root;
  const views = projectLevel
    ? [globalViews[0], ...projectViews.filter((view) => ['overview', 'workflow', 'backlog', 'changes', 'handoff'].includes(view.id))]
    : [...globalViews, projectViews[0]];
  return <nav className="react-mobile-nav" data-primary-navigation="mobile" data-mobile-nav data-mobile-nav-level={projectLevel ? 'project' : 'global'} aria-label="Mobile Primary Workbench Navigation">
    {views.map((view) => {
      const Icon = view.icon;
      const href = projectViewIds.has(view.id) ? projectViewHref(view.id, activeRoot) : `#${view.id}`;
      const active = activeView === view.id;
      return <a key={view.id} href={href} className={active ? 'active' : undefined} data-mobile-nav-link={view.id} aria-current={active ? 'page' : undefined}>
        <Icon size={16} aria-hidden="true" />
        <span>{view.label}</span>
      </a>;
    })}
  </nav>;
}
