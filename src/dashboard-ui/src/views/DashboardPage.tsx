import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

export function DashboardPage({ data }: { data: DashboardData }) {
  const metrics = data.summary?.metrics;
  const selected = data.selectedSnapshot;
  const isAll = data.selectedRoot === ALL_PROJECTS;

  const passedChecks = data.checks.filter((check) => check.passed).length;
  const failedChecks = data.checks.length - passedChecks;
  const review = data.review?.summary || selected?.review;

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Overview</h2>
        <span>{data.loading ? 'Refreshing...' : data.summary?.generated_at ? `Synced at ${new Date(data.summary.generated_at).toLocaleTimeString()}` : 'Ready'}</span>
      </div>

      {/* Metrics Row */}
      <div className="metric-grid five">
        <article className="metric-card">
          <span>Projects</span>
          <strong>{metrics?.projects ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Active Tasks</span>
          <strong>{metrics?.active_tasks ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Blocked Projects</span>
          <strong>{metrics?.blocked_projects ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Failed Gates</span>
          <strong>{metrics?.failed_gates ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Install Failures</span>
          <strong>{metrics?.install_failures ?? '-'}</strong>
        </article>
      </div>

      {/* Main Split Grid */}
      <div className="split-grid wide-left">
        {/* Left Column (60%): Attention Queue & Event Timeline */}
        <div style={{ display: 'grid', gap: '20px', alignContent: 'start' }}>
          {/* Attention Queue */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Attention Queue</h3>
              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.15)' }}>
                {data.summary?.attention.length ?? 0} Required
              </span>
            </div>
            <div style={{ display: 'grid', gap: '10px' }}>
              {data.summary?.attention.length ? (
                data.summary.attention.map((item) => (
                  <button
                    className="attention-box"
                    key={item.project_root}
                    onClick={() => data.selectProject(item.project_root)}
                    type="button"
                    style={{ width: '100%', border: 'none', background: 'rgba(239, 68, 68, 0.05)', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>{item.project_name}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{item.reason}</span>
                      {item.recommended_command && (
                        <code style={{ fontSize: '0.78rem', color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.08)', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start', border: '1px solid rgba(14, 165, 233, 0.15)' }}>
                          {item.recommended_command}
                        </code>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.15)', fontSize: '0.75rem' }}>
                        {item.phase} / {item.gate}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state compact">All projects healthy</div>
              )}
            </div>
          </article>

          {/* Event Timeline */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Recent Project Events' : 'Event Timeline'}</h3>
              <span className="badge">{isAll ? 'all projects' : `latest ${data.events.length}`}</span>
            </div>
            {isAll ? (
              <div className="table-surface">
                {data.summary?.snapshots.length ? (
                  data.summary.snapshots.map((snapshot) => (
                    <button
                      className="table-row wide"
                      key={snapshot.project.root}
                      onClick={() => data.selectProject(snapshot.project.root)}
                      type="button"
                    >
                      <strong>{snapshot.project.name}</strong>
                      <span style={{ color: '#9ca3af' }}>
                        {snapshot.events.latest?.source || 'no events'}
                      </span>
                      <span style={{ color: '#d1d5db' }}>{snapshot.events.latest?.message || '-'}</span>
                      <small style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', padding: '2px 6px', color: '#9ca3af' }}>
                        {snapshot.events.count} events
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">No project snapshots</div>
                )}
              </div>
            ) : (
              <div className="timeline" style={{ maxHeight: '380px', overflowY: 'auto', background: '#0b0f17', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '16px', borderRadius: '10px', fontFamily: 'monospace' }}>
                {data.events.length === 0 ? (
                  <div className="empty-state" style={{ color: '#6b7280' }}>No events recorded for this project</div>
                ) : (
                  data.events.map((event, index) => (
                    <div key={`${event.source}-${event.time}-${index}`} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.03)', fontSize: '0.82rem', lineHeight: '1.4' }}>
                      <span style={{ color: '#6b7280' }}>[{event.time ? new Date(event.time).toLocaleTimeString() : '00:00:00'}]</span>
                      <span style={{ color: event.severity === 'fail' || event.severity === 'blocked' ? '#ef4444' : event.severity === 'warning' ? '#f59e0b' : '#0ea5e9', fontWeight: 600, minWidth: '80px', display: 'inline-block' }}>
                        {event.source.toUpperCase()}
                      </span>
                      <span style={{ color: '#d1d5db', flex: 1 }}>{event.message}</span>
                      {(event.task_id || event.step) && (
                        <span style={{ color: '#a855f7' }}>
                          ({event.task_id || '-'}/{event.step || '-'})
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </article>
        </div>

        {/* Right Column (40%): Route & Gates Summary */}
        <div style={{ display: 'grid', gap: '20px', alignContent: 'start' }}>
          {/* Selected Project Summary */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Global Scope' : 'Active Route'}</h3>
              <span className={`badge ${selected?.project.status || 'ok'}`}>
                {isAll ? 'registry' : selected?.project.status || 'ok'}
              </span>
            </div>
            {isAll ? (
              <dl className="detail-list">
                <div><dt>Registered</dt><dd>{metrics?.projects ?? 0} projects</dd></div>
                <div><dt>Stale / Offline</dt><dd>{metrics?.stale_or_unavailable ?? 0}</dd></div>
                <div><dt>Development Mode</dt><dd>Local Read-Only Console</dd></div>
              </dl>
            ) : selected ? (
              <dl className="detail-list">
                <div><dt>Task</dt><dd style={{ fontWeight: 600, color: '#ffffff' }}>{selected.state?.task_title || selected.state?.task_id || 'No active task'}</dd></div>
                <div><dt>Next Action</dt><dd>{selected.route.next_action}</dd></div>
                <div>
                  <dt>Recommended</dt>
                  <dd>{selected.route.recommended_command ? <code>{selected.route.recommended_command}</code> : '-'}</dd>
                </div>
                <div><dt>Plan Progress</dt><dd>{selected.task_progress.done} / {selected.task_progress.total} steps</dd></div>
              </dl>
            ) : (
              <div className="empty-state compact">Select a project to inspect route</div>
            )}
          </article>

          {/* Gates Health */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Gates Summary' : 'Quality Gates'}</h3>
              <span className={`status-dot ${isAll ? 'completed' : review?.status || 'unknown'}`} />
            </div>
            {isAll ? (
              <dl className="detail-list">
                <div><dt>Blocked Projects</dt><dd>{metrics?.blocked_projects ?? 0}</dd></div>
                <div><dt>Failed Gates</dt><dd>{metrics?.failed_gates ?? 0}</dd></div>
              </dl>
            ) : selected ? (
              <dl className="detail-list">
                <div>
                  <dt>Checks latest</dt>
                  <dd>
                    {selected?.check.latest ? (
                      <span style={{ color: selected.check.latest.passed ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                        {selected.check.latest.passed ? 'PASS' : 'FAIL'}
                      </span>
                    ) : (
                      'no checks'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Static review</dt>
                  <dd>
                    <span style={{ color: review?.status === 'pass' ? '#10b981' : review?.status === 'fail' ? '#ef4444' : '#9ca3af', fontWeight: 600 }}>
                      {review?.status.toUpperCase() || 'UNKNOWN'}
                    </span>
                    {review ? ` (${review.errors} errors, ${review.warnings} warnings)` : ''}
                  </dd>
                </div>
                <div><dt>Check history</dt><dd>{selected.check.passed} pass / {selected.check.failed} fail</dd></div>
                <div><dt>Install health</dt><dd>{selected.install_health.passed ? 'Healthy' : 'Drift detected'}</dd></div>
              </dl>
            ) : (
              <div className="empty-state compact">Select a project for gates details</div>
            )}
          </article>

          {/* Project read errors / registry status */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Workspace Diagnostics</h3>
              <span>{selected?.errors.length ? 'drift' : 'clean'}</span>
            </div>
            {selected?.errors.length ? (
              selected.errors.map((error, idx) => (
                <div className="count-row" key={`${error}-${idx}`} style={{ color: '#ef4444' }}>
                  <span>{error}</span>
                  <strong>!</strong>
                </div>
              ))
            ) : (
              <div className="empty-state compact">
                {selected ? 'No diagnostic errors detected' : 'Registry health ok'}
              </div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
