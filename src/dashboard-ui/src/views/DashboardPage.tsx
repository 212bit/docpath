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
        <span>{data.loading ? 'Refreshing...' : data.summary?.generated_at ? `Generated at ${new Date(data.summary.generated_at).toLocaleTimeString()}` : 'Ready'}</span>
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
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Attention Queue */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Attention Queue</h3>
              <span>{data.summary?.attention.length ?? 0}</span>
            </div>
            <div className="table-surface embedded">
              {data.summary?.attention.length ? (
                data.summary.attention.map((item) => (
                  <button
                    className="table-row attention"
                    key={item.project_root}
                    onClick={() => data.selectProject(item.project_root)}
                    type="button"
                  >
                    <strong>{item.project_name}</strong>
                    <span>{item.reason}</span>
                    <span>{item.phase} / {item.gate}</span>
                    <small style={{ color: '#0ea5e9', fontFamily: 'monospace' }}>
                      {item.recommended_command || '-'}
                    </small>
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
              <span>{isAll ? 'all' : `latest ${data.events.length}`}</span>
            </div>
            {isAll ? (
              <div className="table-surface embedded">
                {data.summary?.snapshots.length ? (
                  data.summary.snapshots.map((snapshot) => (
                    <button
                      className="table-row wide"
                      key={snapshot.project.root}
                      onClick={() => data.selectProject(snapshot.project.root)}
                      type="button"
                    >
                      <strong>{snapshot.project.name}</strong>
                      <span style={{ color: '#64748b' }}>
                        {snapshot.events.latest?.source || 'no events'}
                      </span>
                      <span>{snapshot.events.latest?.message || '-'}</span>
                      <small style={{ background: '#f1f5f9', borderRadius: '4px', padding: '2px 6px' }}>
                        {snapshot.events.count} events
                      </small>
                    </button>
                  ))
                ) : (
                  <div className="empty-state compact">No project snapshots</div>
                )}
              </div>
            ) : (
              <div className="timeline" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                {data.events.length === 0 ? (
                  <div className="empty-state">No events recorded for this project</div>
                ) : (
                  data.events.map((event, index) => (
                    <article className="timeline-row" key={`${event.source}-${event.time}-${index}`}>
                      <div className={`timeline-dot ${event.severity}`} />
                      <div>
                        <div className="timeline-meta">
                          <strong>{event.source}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{event.status}</span>
                          <small>{event.time ? new Date(event.time).toLocaleTimeString() : 'unknown'}</small>
                        </div>
                        <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>{event.message}</p>
                        {(event.task_id || event.step) && (
                          <small style={{ color: '#0ea5e9', fontFamily: 'monospace' }}>
                            {event.task_id || '-'} / {event.step || '-'}
                          </small>
                        )}
                      </div>
                    </article>
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
                <div><dt>Task</dt><dd style={{ fontWeight: 600 }}>{selected.state?.task_title || selected.state?.task_id || 'No active task'}</dd></div>
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
                    <span style={{ color: review?.status === 'pass' ? '#10b981' : review?.status === 'fail' ? '#ef4444' : '#64748b', fontWeight: 600 }}>
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
