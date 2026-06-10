import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { useDashboardData } from './state/useDashboardData';
import { BacklogPage } from './views/BacklogPage';
import { DashboardPage } from './views/DashboardPage';
import { GatesPage } from './views/GatesPage';
import { TasksPage } from './views/TasksPage';
import './styles.css';

const views = [
  { to: '/', label: '总览', end: true },
  { to: '/tasks', label: '任务' },
  { to: '/gates', label: '门禁' },
  { to: '/backlog', label: 'Backlog' },
];

function AppShell() {
  const dashboard = useDashboardData();
  const selectedProject = dashboard.projects.find((project) => project.root === dashboard.selectedRoot);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>
            <strong>DocPath</strong>
            <small>Dashboard</small>
          </span>
        </div>

        <nav className="nav-list" aria-label="Views">
          {views.map((view) => (
            <NavLink key={view.to} to={view.to} end={view.end} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
              {view.label}
            </NavLink>
          ))}
        </nav>

        <section className="project-list" aria-label="Projects">
          <div className="section-title">项目</div>
          {dashboard.projects.length === 0 ? (
            <div className="empty-line">暂无注册项目</div>
          ) : dashboard.projects.map((project) => (
            <button
              className={project.root === dashboard.selectedRoot ? 'project-item selected' : 'project-item'}
              key={project.root}
              onClick={() => dashboard.selectProject(project.root)}
              type="button"
            >
              <span>{project.name || project.root}</span>
              <small>{project.phase || 'idle'} / {project.gate || 'none'}</small>
            </button>
          ))}
        </section>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div>
            <div className="eyebrow">当前项目</div>
            <h1>{selectedProject?.name || '本地工作区'}</h1>
          </div>
          <button className="refresh-button" type="button" onClick={dashboard.refresh}>
            Refresh
          </button>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage data={dashboard} />} />
            <Route path="/tasks" element={<TasksPage data={dashboard} />} />
            <Route path="/gates" element={<GatesPage data={dashboard} />} />
            <Route path="/backlog" element={<BacklogPage data={dashboard} />} />
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
