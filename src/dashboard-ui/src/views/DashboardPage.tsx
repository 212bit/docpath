import type { DashboardData } from '../state/useDashboardData';

export function DashboardPage({ data }: { data: DashboardData }) {
  const activeTasks = data.projects.filter((project) => project.task_id).length + (data.projects.length === 0 && data.state?.task_id ? 1 : 0);
  const blockedProjects = data.projects.filter((project) => project.gate?.includes('fail') || project.phase === 'blocked').length;
  const passedChecks = data.checks.filter((check) => check.passed).length;
  const passRate = data.checks.length === 0 ? '-' : `${Math.round((passedChecks / data.checks.length) * 100)}%`;
  const recent = data.projects.slice(0, 5);

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>总览</h2>
        <span>{data.loading ? 'Loading' : data.error || 'Ready'}</span>
      </div>
      <div className="metric-grid">
        <article className="metric-card">
          <span>项目</span>
          <strong>{data.projects.length}</strong>
        </article>
        <article className="metric-card">
          <span>活跃任务</span>
          <strong>{activeTasks}</strong>
        </article>
        <article className="metric-card">
          <span>Check 通过率</span>
          <strong>{passRate}</strong>
        </article>
        <article className="metric-card">
          <span>阻塞</span>
          <strong>{blockedProjects}</strong>
        </article>
      </div>

      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>当前任务</h3>
            <span>{data.state?.phase || '-'}</span>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Task</dt>
              <dd>{data.state?.task_title || data.state?.task_id || '-'}</dd>
            </div>
            <div>
              <dt>Gate</dt>
              <dd>{data.state?.gate || '-'}</dd>
            </div>
            <div>
              <dt>Step</dt>
              <dd>{data.state?.current_step || '-'}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>最近活动</h3>
            <span>{recent.length}</span>
          </div>
          {recent.length === 0 ? (
            <div className="empty-state compact">暂无注册项目</div>
          ) : recent.map((project) => (
            <div className="activity-row" key={project.root}>
              <strong>{project.name || project.root}</strong>
              <span>{project.phase || 'idle'} / {project.gate || 'none'}</span>
            </div>
          ))}
        </article>
      </div>
    </section>
  );
}
