import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import {
  Activity,
  GitBranch,
  KanbanSquare,
  LayoutDashboard,
  ListTodo,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ALL_PROJECTS, useDashboardData } from './state/useDashboardData';
import { DashboardPage } from './views/DashboardPage';
import { WorkboardPage } from './views/WorkboardPage';
import { WorktreesPage } from './views/WorktreesPage';
import { BacklogPage } from './views/BacklogPage';
import { EventsPage } from './views/EventsPage';
import { GatesPage } from './views/GatesPage';
import './styles.css';

const PROJECT_VIEWS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/workboard', label: 'Workboard', icon: KanbanSquare },
  { to: '/gates', label: 'Gates', icon: ShieldCheck },
  { to: '/events', label: 'Events', icon: Activity },
];

const WORKSPACE_VIEWS = [
  { to: '/backlog', label: 'Backlog', icon: ListTodo },
  { to: '/worktrees', label: 'Worktrees', icon: GitBranch },
];

function projectStatus(project: { status?: string; phase?: string; gate?: string; task_id?: string }): string {
  if (project.status === 'unavailable') return 'unavailable';
  if (project.status === 'partial') return 'partial';
  if (project.gate?.includes('fail') || project.phase === 'blocked') return 'blocked';
  if (project.task_id && project.phase !== 'completed') return 'active';
  if (project.phase === 'completed') return 'completed';
  return 'idle';
}

function AppShell() {
  const dashboard = useDashboardData();
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [collapsed, setCollapsed] = useState(false);

  const isAll = dashboard.selectedRoot === ALL_PROJECTS;
  const selectedProject = dashboard.selectedProject;
  const selectedSnapshot = dashboard.selectedSnapshot;

  const filteredProjects = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    return dashboard.projects.filter((p) => {
      const s = projectStatus(p);
      const statusOk = statusFilter === 'All' || s === statusFilter.toLowerCase();
      const textOk = !q || p.name.toLowerCase().includes(q) || p.root.toLowerCase().includes(q);
      return statusOk && textOk;
    });
  }, [dashboard.projects, projectFilter, statusFilter]);

  const headerTitle = isAll ? 'All Projects' : selectedProject?.name || 'Project unavailable';
  const headerSub = isAll
    ? 'Registry summary and cross-project attention queue'
    : selectedProject?.root || dashboard.detailError || 'No project selected';
  const headerEyebrow = isAll ? 'Global scope' : 'Selected project';

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="sidebar" aria-label="Navigation">
        {/* Brand */}
        <div className="brand">
          <div className="brand-inner">
            <span className="brand-mark">D</span>
            <div className="brand-text">
              <strong>DocPath</strong>
              <small>Dashboard</small>
            </div>
          </div>
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} title="Toggle sidebar" type="button">
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>

        {/* Nav groups */}
        <div className="nav-groups">
          <div className="nav-group">
            <div className="nav-group-label">Project</div>
            {PROJECT_VIEWS.map((v) => (
              <NavLink
                key={v.to}
                to={v.to}
                end={v.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={collapsed ? v.label : undefined}
              >
                <v.icon className="nav-icon" size={15} />
                <span className="nav-label">{v.label}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-group" style={{ marginTop: 8 }}>
            <div className="nav-group-label">Workspace</div>
            {WORKSPACE_VIEWS.map((v) => (
              <NavLink
                key={v.to}
                to={v.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                title={collapsed ? v.label : undefined}
              >
                <v.icon className="nav-icon" size={15} />
                <span className="nav-label">{v.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        {/* Project rail */}
        <div className="project-rail">
          <div className="rail-header">
            <span className="rail-label">Projects</span>
          </div>
          <input
            className="project-search"
            type="search"
            placeholder="Search…"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          />
          <div className="status-chips">
            {['All', 'Active', 'Blocked', 'Idle'].map((s) => (
              <button
                key={s}
                className={`chip${statusFilter === s ? ' active' : ''}`}
                onClick={() => setStatusFilter(s)}
                type="button"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="project-list">
            <button
              className={`project-item${isAll ? ' selected' : ''}`}
              onClick={() => dashboard.selectProject(ALL_PROJECTS)}
              type="button"
            >
              <div className="project-item-name">All Projects</div>
              <div className="project-item-meta">{dashboard.summary?.metrics.projects ?? 0} projects</div>
            </button>
            {filteredProjects.length === 0 ? (
              <div className="empty-rail">No matches</div>
            ) : filteredProjects.map((p) => {
              const s = projectStatus(p);
              return (
                <button
                  key={p.root}
                  className={`project-item${p.root === dashboard.selectedRoot ? ' selected' : ''}`}
                  onClick={() => dashboard.selectProject(p.root)}
                  type="button"
                >
                  <div className="project-item-name">
                    <i className={`dot ${s}`} />
                    {p.name || p.root}
                  </div>
                  <div className="project-item-meta">{s} / {p.gate || 'none'}</div>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main-column">
        {/* 2-zone header */}
        <header className="top-header">
          <div className="header-identity">
            <div className="header-eyebrow">{headerEyebrow}</div>
            <div className="header-title">{headerTitle}</div>
            <div className="header-subtitle">{headerSub}</div>
          </div>
          <div className="header-actions">
            {!isAll && (
              <>
                <span className="badge">{selectedSnapshot?.state?.phase || selectedProject?.phase || 'idle'}</span>
                <span className="badge">{selectedSnapshot?.state?.gate || selectedProject?.gate || 'none'}</span>
              </>
            )}
            {isAll && (
              <>
                <span className="badge">{dashboard.projects.length} projects</span>
                <span className="badge">{dashboard.summary?.metrics.active_tasks ?? 0} active</span>
              </>
            )}
            <button className="btn" type="button" onClick={dashboard.refresh}>
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
        </header>

        {(dashboard.error || dashboard.detailError) && (
          <div className="error-banner">{dashboard.error || dashboard.detailError}</div>
        )}

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage data={dashboard} />} />
            <Route path="/workboard" element={<WorkboardPage data={dashboard} />} />
            <Route path="/gates" element={<GatesPage data={dashboard} />} />
            <Route path="/events" element={<EventsPage data={dashboard} />} />
            <Route path="/backlog" element={<BacklogPage data={dashboard} />} />
            <Route path="/worktrees" element={<WorktreesPage data={dashboard} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  </React.StrictMode>,
);
