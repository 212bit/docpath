import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { ALL_PROJECTS, useDashboardData } from './state/useDashboardData';
import { DashboardPage } from './views/DashboardPage';
import { WorkboardPage } from './views/WorkboardPage';
import { WorktreesPage } from './views/WorktreesPage';
import './styles.css';

const views = [
  { to: '/', label: 'Overview', end: true },
  { to: '/workboard', label: 'Workboard' },
  { to: '/worktrees', label: 'Worktrees' },
];

function projectStatus(project: { status?: string; phase?: string; gate?: string; task_id?: string }): string {
  if (project.status === 'unavailable') return 'Unavailable';
  if (project.status === 'partial') return 'Partial';
  if (project.gate?.includes('fail') || project.phase === 'blocked') return 'Blocked';
  if (project.task_id && project.phase !== 'completed') return 'Active';
  if (project.phase === 'completed') return 'Completed';
  return 'Idle';
}

function AppShell() {
  const dashboard = useDashboardData();
  const [projectFilter, setProjectFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const filteredProjects = useMemo(() => {
    const query = projectFilter.trim().toLowerCase();
    return dashboard.projects.filter((project) => {
      const status = projectStatus(project);
      const statusMatches = statusFilter === 'All' || status === statusFilter;
      const textMatches = !query ||
        project.name.toLowerCase().includes(query) ||
        project.root.toLowerCase().includes(query);
      return statusMatches && textMatches;
    });
  }, [dashboard.projects, projectFilter, statusFilter]);

  const selectedSnapshot = dashboard.selectedSnapshot;
  const route = selectedSnapshot?.route;
  const selectedProject = dashboard.selectedProject;
  const isAllProjects = dashboard.selectedRoot === ALL_PROJECTS;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>
            <strong>DocPath</strong>
            <small>Read-only dashboard</small>
          </span>
        </div>

        <nav className="nav-list" aria-label="Views">
          {views.map((view) => (
            <NavLink key={view.to} to={view.to} end={view.end} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              {view.label}
            </NavLink>
          ))}
        </nav>

        <section className="rail-section" aria-label="Project selector">
          <div className="section-title">Projects</div>
          <input
            className="project-search"
            type="search"
            placeholder="Search projects"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          />
          <div className="chip-row" aria-label="Project status filter">
            {['All', 'Active', 'Blocked', 'Unavailable'].map((status) => (
              <button
                className={statusFilter === status ? 'chip active' : 'chip'}
                key={status}
                onClick={() => setStatusFilter(status)}
                type="button"
              >
                {status}
              </button>
            ))}
          </div>
          <button
            className={isAllProjects ? 'project-item selected' : 'project-item'}
            onClick={() => dashboard.selectProject(ALL_PROJECTS)}
            type="button"
          >
            <span>All Projects</span>
            <small>{dashboard.summary?.metrics.projects ?? 0} projects / {dashboard.summary?.metrics.blocked_projects ?? 0} blocked</small>
          </button>
          {filteredProjects.length === 0 ? (
            <div className="empty-line">No matching projects</div>
          ) : filteredProjects.map((project) => {
            const status = projectStatus(project);
            return (
              <button
                className={project.root === dashboard.selectedRoot ? 'project-item selected' : 'project-item'}
                key={project.root}
                onClick={() => dashboard.selectProject(project.root)}
                type="button"
              >
                <span><i className={`status-dot ${status.toLowerCase()}`} />{project.name || project.root}</span>
                <small>{status} / {project.gate || 'none'}</small>
              </button>
            );
          })}
        </section>

      </aside>

      <div className="main-column">
        <header className="route-band">
          <div className="route-title">
            <div className="eyebrow">{isAllProjects ? 'Global scope' : 'Selected project'}</div>
            <h1>{isAllProjects ? 'All Projects' : selectedProject?.name || 'Project unavailable'}</h1>
            <p>{isAllProjects ? 'Registry summary and cross-project attention queue' : selectedProject?.root || dashboard.detailError || 'No project selected'}</p>
          </div>
          <div className="route-status">
            <span className="badge">{isAllProjects ? `${dashboard.projects.length} projects` : selectedSnapshot?.state?.phase || selectedProject?.phase || 'unknown'}</span>
            <span className="badge">{isAllProjects ? `${dashboard.summary?.metrics.active_tasks ?? 0} active` : selectedSnapshot?.state?.gate || selectedProject?.gate || 'none'}</span>
            {!isAllProjects && <span className="badge">{selectedSnapshot?.task_progress.current_step || 'no step'}</span>}
          </div>
          <div className="route-action">
            <span>{isAllProjects ? 'Select a project for detail reads.' : route?.next_action || 'Read-only project summary.'}</span>
            {!isAllProjects && route?.recommended_command ? (
              <code>{route.recommended_command}</code>
            ) : null}
          </div>
          <button className="refresh-button" type="button" onClick={dashboard.refresh}>
            Refresh
          </button>
        </header>

        {(dashboard.error || dashboard.detailError) && (
          <div className="banner error">{dashboard.error || dashboard.detailError}</div>
        )}

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage data={dashboard} />} />
            <Route path="/workboard" element={<WorkboardPage data={dashboard} />} />
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
