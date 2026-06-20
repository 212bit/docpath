import { useEffect, useState } from 'react';
import { fetchWorkspaces, type WorkspacesPayload } from '../lib/api';
import type { DashboardData } from '../state/useDashboardData';
import { RefreshCw } from 'lucide-react';

export function WorktreesPage({ data }: { data: DashboardData }) {
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchWorkspaces()
      .then((res) => { if (!cancelled) setWorkspaces(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tick, data.selectedRoot]);

  const worktrees = workspaces?.worktrees ?? [];
  const sessions = workspaces?.sessions ?? [];
  const leases = workspaces?.leases ?? [];

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Worktrees &amp; Sessions</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="hint">{loading ? 'Syncing…' : 'Synced'}</span>
          <button className="btn" type="button" onClick={() => setTick((n) => n + 1)}>
            <RefreshCw size={12} /> Sync
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="metric-grid metric-grid-4">
        <div className="metric-card"><span className="metric-label">Git Worktrees</span><span className="metric-value">{worktrees.length}</span></div>
        <div className="metric-card"><span className="metric-label">Active Sessions</span><span className="metric-value">{sessions.length}</span></div>
        <div className="metric-card"><span className="metric-label">Lease Locks</span><span className="metric-value" style={{ color: leases.length > 0 ? 'var(--color-status-fail)' : 'var(--color-text-primary)' }}>{leases.length}</span></div>
        <div className="metric-card"><span className="metric-label">Main Project</span><span className="metric-value" style={{ fontSize: '0.8rem', paddingTop: 6 }}>{data.selectedProject?.name || 'All'}</span></div>
      </div>

      <div className="split-grid split-grid-wide">
        {/* Worktrees list */}
        <article className="panel">
          <div className="panel-heading">
            <h3>Git Worktrees</h3>
            <span className="badge">{worktrees.length}</span>
          </div>
          <div className="table-surface inset">
            {worktrees.length === 0 ? (
              <div className="empty">No Git worktrees detected</div>
            ) : worktrees.map((wt) => {
              const hasSession = sessions.some((s) => s.cwd.startsWith(wt.path) || wt.path.startsWith(s.cwd));
              const hasLease = leases.some((l) => wt.path.includes(l.resource));
              const name = wt.path.split('/').pop() || wt.path;
              return (
                <div key={wt.path} className="table-row" style={{ gridTemplateColumns: '1fr 1fr 80px auto' }}>
                  <div>
                    <strong title={wt.path}>{name}</strong>
                    <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }} title={wt.path}>{wt.path}</div>
                  </div>
                  <span className="badge accent" style={{ justifySelf: 'start', alignSelf: 'center' }}>{wt.branch || 'detached'}</span>
                  <code className="mono" style={{ alignSelf: 'center' }}>{wt.head.slice(0, 7)}</code>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {hasSession && <span className="badge pass">Active</span>}
                    {hasLease && <span className="badge warn">Leased</span>}
                    {!hasSession && !hasLease && <span className="badge">Idle</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        {/* Sessions + Leases */}
        <div className="view-stack">
          <article className="panel">
            <div className="panel-heading">
              <h3>Active Sessions</h3>
              <span className="badge">{sessions.length}</span>
            </div>
            {sessions.length === 0 ? (
              <div className="empty inline">No active agent sessions</div>
            ) : sessions.map((sess) => (
              <div key={sess.session_id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="dot active" />
                    <strong style={{ fontSize: '0.82rem' }}>PID {sess.pid}</strong>
                  </div>
                  <code className="mono">{sess.session_id.slice(0, 8)}</code>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                  <code className="mono">{sess.command}</code>
                </div>
                {sess.task_id && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)' }}>
                    {sess.task_id}{sess.step ? ` / ${sess.step}` : ''}
                  </div>
                )}
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                  {new Date(sess.updated_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </article>

          <article className="panel">
            <div className="panel-heading">
              <h3>Lease Locks</h3>
              <span className={`badge ${leases.length > 0 ? 'fail' : ''}`}>{leases.length} active</span>
            </div>
            {leases.length === 0 ? (
              <div className="empty inline">No active lease locks</div>
            ) : leases.map((lease, i) => (
              <div key={`${lease.resource}-${i}`} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lease.resource}>
                    {lease.resource.split('/').pop() || lease.resource}
                  </strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="pulse" />
                    <span className="badge fail">LOCKED</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                  <code className="mono">{lease.session_id.slice(0, 8)}</code> · PID {lease.pid}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-accent)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  {lease.task_id}{lease.step ? ` / ${lease.step}` : ''}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                  Expires {new Date(lease.expires_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </article>
        </div>
      </div>
    </section>
  );
}
