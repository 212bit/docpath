import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function countBacklog(snapshot: DashboardData['selectedSnapshot']): number {
  if (!snapshot) return 0;
  return Object.values(snapshot.backlog_counts).reduce((sum, count) => sum + count, 0);
}

export function DashboardPage({ data }: { data: DashboardData }) {
  const metrics = data.summary?.metrics;
  const selected = data.selectedSnapshot;
  const isAll = data.selectedRoot === ALL_PROJECTS;

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Overview</h2>
        <span>{data.loading ? 'Loading' : data.summary?.generated_at || 'Ready'}</span>
      </div>

      <div className="metric-grid five">
        <article className="metric-card">
          <span>Projects</span>
          <strong>{metrics?.projects ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Active tasks</span>
          <strong>{metrics?.active_tasks ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Blocked</span>
          <strong>{metrics?.blocked_projects ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Failed gates</span>
          <strong>{metrics?.failed_gates ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Install failures</span>
          <strong>{metrics?.install_failures ?? '-'}</strong>
        </article>
      </div>

      <div className="split-grid wide-left">
        <article className="panel">
          <div className="panel-heading">
            <h3>Attention Queue</h3>
            <span>{data.summary?.attention.length ?? 0}</span>
          </div>
          <div className="table-surface embedded">
            {data.summary?.attention.length ? data.summary.attention.map((item) => (
              <button
                className="table-row attention"
                key={item.project_root}
                onClick={() => data.selectProject(item.project_root)}
                type="button"
              >
                <strong>{item.project_name}</strong>
                <span>{item.reason}</span>
                <span>{item.phase} / {item.gate}</span>
                <small>{item.recommended_command || '-'}</small>
              </button>
            )) : (
              <div className="empty-state compact">No project attention items</div>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>{isAll ? 'Global Summary' : 'Selected Route'}</h3>
            <span>{selected?.project.status || 'readonly'}</span>
          </div>
          {isAll ? (
            <dl className="detail-list">
              <div><dt>Registry</dt><dd>{metrics?.projects ?? 0} projects tracked</dd></div>
              <div><dt>Stale / unavailable</dt><dd>{metrics?.stale_or_unavailable ?? 0}</dd></div>
              <div><dt>Mode</dt><dd>Read-only, local registry</dd></div>
            </dl>
          ) : selected ? (
            <dl className="detail-list">
              <div><dt>Task</dt><dd>{selected.state?.task_title || selected.state?.task_id || 'No active task'}</dd></div>
              <div><dt>Next action</dt><dd>{selected.route.next_action}</dd></div>
              <div><dt>Recommended</dt><dd>{selected.route.recommended_command || '-'}</dd></div>
              <div><dt>Progress</dt><dd>{selected.task_progress.done}/{selected.task_progress.total} steps</dd></div>
              <div><dt>Backlog</dt><dd>{countBacklog(selected)} items</dd></div>
              <div><dt>Install health</dt><dd>{selected.install_health.passed ? 'Passed' : selected.install_health.issue_ids.join(', ') || 'Failed'}</dd></div>
            </dl>
          ) : (
            <div className="empty-state compact">Select a project for route details</div>
          )}
        </article>
      </div>

      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>Recent Gate</h3>
            <span>{selected?.check.latest ? 'latest' : 'none'}</span>
          </div>
          {selected ? (
            <dl className="detail-list">
              <div><dt>Checks</dt><dd>{selected.check.passed} pass / {selected.check.failed} fail</dd></div>
              <div><dt>Review</dt><dd>{selected.review.status} · {selected.review.errors} errors · {selected.review.warnings} warnings</dd></div>
              <div><dt>Events</dt><dd>{selected.events.count}{selected.events.truncated ? '+ truncated' : ''}</dd></div>
            </dl>
          ) : (
            <div className="empty-state compact">Select a project for gate history</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Project Health</h3>
            <span>{selected?.errors.length ? 'partial' : 'ok'}</span>
          </div>
          {selected?.errors.length ? (
            selected.errors.map((error) => <div className="count-row" key={error}><span>{error}</span><strong>!</strong></div>)
          ) : (
            <div className="empty-state compact">{selected ? 'No project read errors' : 'Global scope selected'}</div>
          )}
        </article>
      </div>
    </section>
  );
}
