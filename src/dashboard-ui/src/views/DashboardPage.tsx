import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

export function DashboardPage({ data }: { data: DashboardData }) {
  const metrics = data.summary?.metrics;
  const selected = data.selectedSnapshot;
  const isAll = data.selectedRoot === ALL_PROJECTS;
  const review = data.review?.summary || selected?.review;

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Overview</h2>
        <span className="hint">
          {data.loading ? 'Refreshing…' : data.summary?.generated_at
            ? `Synced ${new Date(data.summary.generated_at).toLocaleTimeString()}`
            : 'Ready'}
        </span>
      </div>

      {/* Metrics */}
      <div className={`metric-grid ${isAll ? 'metric-grid-5' : 'metric-grid-4'}`}>
        {isAll ? (
          <>
            <div className="metric-card"><span className="metric-label">Projects</span><span className="metric-value">{metrics?.projects ?? '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Active Tasks</span><span className="metric-value">{metrics?.active_tasks ?? '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Blocked</span><span className="metric-value">{metrics?.blocked_projects ?? '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Failed Gates</span><span className="metric-value">{metrics?.failed_gates ?? '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Install Failures</span><span className="metric-value">{metrics?.install_failures ?? '-'}</span></div>
          </>
        ) : (
          <>
            <div className="metric-card"><span className="metric-label">Phase</span><span className="metric-value" style={{ fontSize: '1rem', paddingTop: 4 }}>{selected?.state?.phase || '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Gate</span><span className="metric-value" style={{ fontSize: '1rem', paddingTop: 4 }}>{selected?.state?.gate || '-'}</span></div>
            <div className="metric-card"><span className="metric-label">Steps Done</span><span className="metric-value">{selected?.task_progress.done ?? '-'}<span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>/{selected?.task_progress.total ?? '-'}</span></span></div>
            <div className="metric-card"><span className="metric-label">Check Status</span><span className="metric-value" style={{ fontSize: '1rem', paddingTop: 4, color: selected?.check.latest ? (selected.check.latest.passed ? 'var(--color-status-active)' : 'var(--color-status-fail)') : 'var(--color-text-muted)' }}>{selected?.check.latest ? (selected.check.latest.passed ? 'PASS' : 'FAIL') : '-'}</span></div>
          </>
        )}
      </div>

      {/* Main content */}
      <div className={`split-grid ${isAll ? '' : 'split-grid-wide'}`}>
        {/* Left */}
        <div className="view-stack">
          {/* Attention queue */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Attention Queue</h3>
              <span className="badge fail">{data.summary?.attention.length ?? 0} required</span>
            </div>
            <div className="view-stack" style={{ gap: 8 }}>
              {data.summary?.attention.length ? (
                data.summary.attention.map((item) => (
                  <button
                    key={item.project_root}
                    className="attention-item"
                    onClick={() => data.selectProject(item.project_root)}
                    type="button"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>{item.project_name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{item.reason}</span>
                      {item.recommended_command && (
                        <code className="mono" style={{ alignSelf: 'flex-start', marginTop: 2 }}>{item.recommended_command}</code>
                      )}
                    </div>
                    <span className="badge fail">{item.phase} / {item.gate}</span>
                  </button>
                ))
              ) : (
                <div className="empty inline">All projects healthy</div>
              )}
            </div>
          </article>

          {/* Events panel */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Recent Project Events' : 'Event Timeline'}</h3>
              <span className="badge">{isAll ? 'all projects' : `${data.events.length} events`}</span>
            </div>
            {isAll ? (
              <div className="table-surface inset">
                {data.summary?.snapshots.length ? (
                  data.summary.snapshots.map((snap) => (
                    <button
                      key={snap.project.root}
                      className="table-row col-4"
                      onClick={() => data.selectProject(snap.project.root)}
                      type="button"
                    >
                      <strong>{snap.project.name}</strong>
                      <span>{snap.events.latest?.source || 'no events'}</span>
                      <span>{snap.events.latest?.message || '-'}</span>
                      <small>{snap.events.count} events</small>
                    </button>
                  ))
                ) : (
                  <div className="empty">No snapshots</div>
                )}
              </div>
            ) : (
              <div className="table-surface inset" style={{ maxHeight: 320, overflowY: 'auto' }}>
                {data.events.length === 0 ? (
                  <div className="empty">No events recorded</div>
                ) : (
                  <div className="timeline">
                    {data.events.slice(0, 30).map((ev, i) => (
                      <div key={`${ev.source}-${ev.time}-${i}`} className="timeline-row">
                        <span className={`timeline-dot ${ev.severity}`} />
                        <div>
                          <div className="timeline-meta">
                            <strong>{ev.source.toUpperCase()}</strong>
                            <span>{ev.time ? new Date(ev.time).toLocaleTimeString() : '-'}</span>
                            {(ev.task_id || ev.step) && <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>{ev.task_id}/{ev.step}</span>}
                          </div>
                          <div className="timeline-msg">{ev.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        </div>

        {/* Right */}
        <div className="view-stack">
          {/* Active route */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Registry' : 'Active Route'}</h3>
              <span className="badge">{isAll ? 'global' : selected?.project.status || 'ok'}</span>
            </div>
            {isAll ? (
              <div className="detail-list">
                <dl><dt>Registered</dt><dd>{metrics?.projects ?? 0} projects</dd></dl>
                <dl><dt>Stale / Offline</dt><dd>{metrics?.stale_or_unavailable ?? 0}</dd></dl>
                <dl><dt>Mode</dt><dd>Read-only dashboard</dd></dl>
              </div>
            ) : selected ? (
              <div className="detail-list">
                <dl><dt>Task</dt><dd style={{ fontWeight: 600 }}>{selected.state?.task_title || selected.state?.task_id || 'No active task'}</dd></dl>
                <dl><dt>Next Action</dt><dd>{selected.route.next_action}</dd></dl>
                <dl><dt>Recommended</dt><dd>{selected.route.recommended_command ? <code className="mono">{selected.route.recommended_command}</code> : '-'}</dd></dl>
                <dl><dt>Progress</dt><dd>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="progress-bar" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${selected.task_progress.total ? (selected.task_progress.done / selected.task_progress.total) * 100 : 0}%` }} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {selected.task_progress.done}/{selected.task_progress.total}
                    </span>
                  </div>
                </dd></dl>
              </div>
            ) : (
              <div className="empty inline">Select a project to inspect route</div>
            )}
          </article>

          {/* Gates health */}
          <article className="panel">
            <div className="panel-heading">
              <h3>{isAll ? 'Gates Summary' : 'Quality Gates'}</h3>
              <span className={`badge ${review?.status === 'pass' ? 'pass' : review?.status === 'fail' ? 'fail' : ''}`}>
                {review?.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
            {isAll ? (
              <div className="detail-list">
                <dl><dt>Blocked Projects</dt><dd>{metrics?.blocked_projects ?? 0}</dd></dl>
                <dl><dt>Failed Gates</dt><dd>{metrics?.failed_gates ?? 0}</dd></dl>
              </div>
            ) : selected ? (
              <div className="detail-list">
                <dl><dt>Latest Check</dt><dd style={{ color: selected.check.latest ? (selected.check.latest.passed ? 'var(--color-status-active)' : 'var(--color-status-fail)') : 'var(--color-text-muted)', fontWeight: 600 }}>
                  {selected.check.latest ? (selected.check.latest.passed ? 'PASS' : 'FAIL') : 'no checks'}
                </dd></dl>
                <dl><dt>Static Review</dt><dd style={{ color: review?.status === 'pass' ? 'var(--color-status-active)' : review?.status === 'fail' ? 'var(--color-status-fail)' : 'var(--color-text-muted)', fontWeight: 600 }}>
                  {review?.status?.toUpperCase() || 'UNKNOWN'}
                  {review ? ` — ${review.errors}e ${review.warnings}w` : ''}
                </dd></dl>
                <dl><dt>Check History</dt><dd>{selected.check.passed} pass / {selected.check.failed} fail</dd></dl>
                <dl><dt>Install Health</dt><dd style={{ color: selected.install_health.passed ? 'var(--color-status-active)' : 'var(--color-status-fail)' }}>{selected.install_health.passed ? 'Healthy' : 'Drift detected'}</dd></dl>
              </div>
            ) : (
              <div className="empty inline">Select a project for gates details</div>
            )}
          </article>

          {/* Diagnostics */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Workspace Diagnostics</h3>
              <span className={`badge ${selected?.errors.length ? 'fail' : ''}`}>{selected?.errors.length ? 'drift' : 'clean'}</span>
            </div>
            {selected?.errors.length ? (
              <div className="view-stack" style={{ gap: 6 }}>
                {selected.errors.map((err, i) => (
                  <div key={i} style={{ fontSize: '0.78rem', color: 'var(--color-status-fail)', padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>{err}</div>
                ))}
              </div>
            ) : (
              <div className="empty inline">{selected ? 'No diagnostic errors' : 'Registry health ok'}</div>
            )}
          </article>
        </div>
      </div>
    </section>
  );
}
