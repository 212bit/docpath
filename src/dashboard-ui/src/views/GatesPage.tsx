import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

export function GatesPage({ data }: { data: DashboardData }) {
  const isAll = data.selectedRoot === ALL_PROJECTS;

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Gates</h2>
          <span>All Projects</span>
        </div>
        <div className="metric-grid">
          <article className="metric-card"><span>Failed gates</span><strong>{data.summary?.metrics.failed_gates ?? '-'}</strong></article>
          <article className="metric-card"><span>Install failures</span><strong>{data.summary?.metrics.install_failures ?? '-'}</strong></article>
          <article className="metric-card"><span>Partial projects</span><strong>{data.summary?.metrics.stale_or_unavailable ?? '-'}</strong></article>
          <article className="metric-card"><span>Blocked</span><strong>{data.summary?.metrics.blocked_projects ?? '-'}</strong></article>
        </div>
        <div className="table-surface">
          {data.summary?.snapshots.map((snapshot) => (
            <button className="table-row wide" key={snapshot.project.root} onClick={() => data.selectProject(snapshot.project.root)} type="button">
              <strong>{snapshot.project.name}</strong>
              <span>check {snapshot.check.passed}/{snapshot.check.failed}</span>
              <span>review {snapshot.review.status}</span>
              <small>install {snapshot.install_health.passed ? 'pass' : 'fail'}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  const snapshot = data.selectedSnapshot;
  const passed = data.checks.filter((check) => check.passed).length;
  const failed = data.checks.length - passed;
  const review = data.review?.summary || snapshot?.review;

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Gates</h2>
        <span>{review?.status || 'unknown'}</span>
      </div>

      <div className="metric-grid">
        <article className="metric-card"><span>Check PASS</span><strong>{passed}</strong></article>
        <article className="metric-card"><span>Check FAIL</span><strong>{failed}</strong></article>
        <article className="metric-card"><span>Review errors</span><strong>{review?.errors ?? '-'}</strong></article>
        <article className="metric-card"><span>Review warnings</span><strong>{review?.warnings ?? '-'}</strong></article>
      </div>

      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>Install Health</h3>
            <span>{snapshot?.install_health.passed ? 'pass' : 'fail'}</span>
          </div>
          {snapshot ? (
            <dl className="detail-list">
              <div><dt>Target</dt><dd>{snapshot.install_health.target || '-'}</dd></div>
              <div><dt>Assets</dt><dd>{snapshot.install_health.asset_count}</dd></div>
              <div><dt>Issues</dt><dd>{snapshot.install_health.issue_ids.join(', ') || 'none'}</dd></div>
              <div><dt>Suggestion</dt><dd>{snapshot.install_health.recommended_command || '-'}</dd></div>
            </dl>
          ) : <div className="empty-state compact">No project selected</div>}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Check History</h3>
            <span>{data.checks.length}</span>
          </div>
          <div className="table-surface embedded">
            {data.checks.length === 0 ? (
              <div className="empty-state compact">No check records</div>
            ) : data.checks.map((check) => (
              <div className="table-row" key={check.timestamp}>
                <strong>{check.passed ? 'PASS' : 'FAIL'}</strong>
                <span>{check.failedChecks.length ? check.failedChecks.join(', ') : '0 failures'}</span>
                <small>{check.timestamp}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel">
        <div className="panel-heading">
          <h3>Review Evidence</h3>
          <span>{review?.status || 'unknown'}</span>
        </div>
        {data.review?.markdown ? (
          <pre className="review-block">{data.review.markdown}</pre>
        ) : (
          <div className="empty-state compact">No review evidence yet</div>
        )}
      </article>
    </section>
  );
}
