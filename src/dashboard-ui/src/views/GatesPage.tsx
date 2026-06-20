import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

export function GatesPage({ data }: { data: DashboardData }) {
  const isAll = data.selectedRoot === ALL_PROJECTS;
  const snapshot = data.selectedSnapshot;
  const review = data.review?.summary || snapshot?.review;
  const passed = data.checks.filter((c) => c.passed).length;
  const failed = data.checks.length - passed;

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Gates</h2>
          <span className="hint">All Projects</span>
        </div>

        <div className="metric-grid metric-grid-4">
          <div className="metric-card"><span className="metric-label">Failed Gates</span><span className="metric-value" style={{ color: (data.summary?.metrics.failed_gates ?? 0) > 0 ? 'var(--color-status-fail)' : 'var(--color-text-primary)' }}>{data.summary?.metrics.failed_gates ?? '-'}</span></div>
          <div className="metric-card"><span className="metric-label">Install Failures</span><span className="metric-value">{data.summary?.metrics.install_failures ?? '-'}</span></div>
          <div className="metric-card"><span className="metric-label">Stale / Partial</span><span className="metric-value">{data.summary?.metrics.stale_or_unavailable ?? '-'}</span></div>
          <div className="metric-card"><span className="metric-label">Blocked Projects</span><span className="metric-value" style={{ color: (data.summary?.metrics.blocked_projects ?? 0) > 0 ? 'var(--color-status-fail)' : 'var(--color-text-primary)' }}>{data.summary?.metrics.blocked_projects ?? '-'}</span></div>
        </div>

        <div className="table-surface">
          {data.summary?.snapshots.length ? data.summary.snapshots.map((snap) => (
            <button
              key={snap.project.root}
              className="table-row col-4"
              onClick={() => data.selectProject(snap.project.root)}
              type="button"
            >
              <strong>{snap.project.name}</strong>
              <span>check {snap.check.passed}p / {snap.check.failed}f</span>
              <span style={{ color: snap.review.status === 'pass' ? 'var(--color-status-active)' : snap.review.status === 'fail' ? 'var(--color-status-fail)' : 'var(--color-text-muted)', fontWeight: 600 }}>
                review {snap.review.status.toUpperCase()}
              </span>
              <small style={{ color: snap.install_health.passed ? 'var(--color-status-active)' : 'var(--color-status-fail)' }}>
                install {snap.install_health.passed ? 'pass' : 'fail'}
              </small>
            </button>
          )) : <div className="empty">No project snapshots</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Gates</h2>
        <span className={`badge ${review?.status === 'pass' ? 'pass' : review?.status === 'fail' ? 'fail' : ''}`}>
          {review?.status?.toUpperCase() || 'UNKNOWN'}
        </span>
      </div>

      {/* Check metrics */}
      <div className="metric-grid metric-grid-4">
        <div className="metric-card"><span className="metric-label">Check PASS</span><span className="metric-value" style={{ color: 'var(--color-status-active)' }}>{passed}</span></div>
        <div className="metric-card"><span className="metric-label">Check FAIL</span><span className="metric-value" style={{ color: failed > 0 ? 'var(--color-status-fail)' : 'var(--color-text-primary)' }}>{failed}</span></div>
        <div className="metric-card"><span className="metric-label">Review Errors</span><span className="metric-value" style={{ color: (review?.errors ?? 0) > 0 ? 'var(--color-status-fail)' : 'var(--color-text-primary)' }}>{review?.errors ?? '-'}</span></div>
        <div className="metric-card"><span className="metric-label">Review Warnings</span><span className="metric-value" style={{ color: (review?.warnings ?? 0) > 0 ? 'var(--color-status-warn)' : 'var(--color-text-primary)' }}>{review?.warnings ?? '-'}</span></div>
      </div>

      <div className="split-grid">
        {/* Install health */}
        <article className="panel">
          <div className="panel-heading">
            <h3>Install Health</h3>
            <span className={`badge ${snapshot?.install_health.passed ? 'pass' : 'fail'}`}>
              {snapshot?.install_health.passed ? 'PASS' : 'FAIL'}
            </span>
          </div>
          {snapshot ? (
            <div className="detail-list">
              <dl><dt>Target</dt><dd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{snapshot.install_health.target || '-'}</dd></dl>
              <dl><dt>Assets</dt><dd>{snapshot.install_health.asset_count}</dd></dl>
              <dl><dt>Issues</dt><dd style={{ color: snapshot.install_health.issue_ids.length ? 'var(--color-status-fail)' : 'var(--color-status-active)' }}>{snapshot.install_health.issue_ids.join(', ') || 'none'}</dd></dl>
              <dl><dt>Suggestion</dt><dd>{snapshot.install_health.recommended_command ? <code className="mono">{snapshot.install_health.recommended_command}</code> : '-'}</dd></dl>
            </div>
          ) : <div className="empty inline">No project selected</div>}
        </article>

        {/* Check history */}
        <article className="panel">
          <div className="panel-heading">
            <h3>Check History</h3>
            <span className="badge">{data.checks.length} runs</span>
          </div>
          <div className="table-surface inset">
            {data.checks.length === 0 ? (
              <div className="empty inline">No check records</div>
            ) : data.checks.map((check) => (
              <div key={check.timestamp} className="table-row col-3">
                <strong style={{ color: check.passed ? 'var(--color-status-active)' : 'var(--color-status-fail)' }}>
                  {check.passed ? 'PASS' : 'FAIL'}
                </strong>
                <span style={{ fontSize: '0.72rem' }}>{check.failedChecks.length ? check.failedChecks.join(', ') : '—'}</span>
                <small style={{ fontFamily: 'var(--font-mono)' }}>{new Date(check.timestamp).toLocaleTimeString()}</small>
              </div>
            ))}
          </div>
        </article>
      </div>

      {/* Review evidence */}
      <article className="panel">
        <div className="panel-heading">
          <h3>Review Evidence</h3>
          <span className={`badge ${review?.status === 'pass' ? 'pass' : review?.status === 'fail' ? 'fail' : ''}`}>
            {review?.status?.toUpperCase() || 'UNKNOWN'}
          </span>
        </div>
        {data.review?.markdown ? (
          <pre className="code-block">{data.review.markdown}</pre>
        ) : (
          <div className="empty inline">No review evidence yet</div>
        )}
      </article>
    </section>
  );
}
