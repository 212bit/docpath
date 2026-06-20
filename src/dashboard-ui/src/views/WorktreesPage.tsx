import { useEffect, useState } from 'react';
import { fetchWorkspaces, type WorkspacesPayload } from '../lib/api';
import type { DashboardData } from '../state/useDashboardData';

export function WorktreesPage({ data }: { data: DashboardData }) {
  const [workspaces, setWorkspaces] = useState<WorkspacesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchWorkspaces();
        if (!cancelled) {
          setWorkspaces(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, data.selectedRoot]);

  const triggerRefresh = () => setRefreshToken((prev) => prev + 1);

  const worktrees = workspaces?.worktrees || [];
  const sessions = workspaces?.sessions || [];
  const leases = workspaces?.leases || [];

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Worktrees & Sessions</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span>{loading ? 'Refreshing...' : 'Synced'}</span>
          <button className="refresh-button" type="button" onClick={triggerRefresh} style={{ height: '32px', minWidth: '70px', padding: '0 8px' }}>
            Sync
          </button>
        </div>
      </div>

      {error && <div className="banner error">{error}</div>}

      {/* Metrics Row */}
      <div className="metric-grid">
        <article className="metric-card">
          <span>Git Worktrees</span>
          <strong>{worktrees.length}</strong>
        </article>
        <article className="metric-card">
          <span>Active Sessions</span>
          <strong>{sessions.length}</strong>
        </article>
        <article className="metric-card">
          <span>Lease Locks</span>
          <strong>{leases.length}</strong>
        </article>
      </div>

      <div className="split-grid wide-left">
        {/* Left Column (60%): Git Worktrees */}
        <div style={{ display: 'grid', gap: '20px' }}>
          <article className="panel">
            <div className="panel-heading">
              <h3>Git Worktree List</h3>
              <span className="badge">{worktrees.length} worktrees</span>
            </div>
            <div className="table-surface">
              {worktrees.length === 0 ? (
                <div className="empty-state">No Git worktrees detected.</div>
              ) : (
                worktrees.map((wt) => {
                  const hasSession = sessions.some((s) => s.cwd.startsWith(wt.path) || wt.path.startsWith(s.cwd));
                  const hasLease = leases.some((l) => wt.path.includes(l.resource));
                  const folderName = wt.path.split('/').pop() || wt.path;

                  return (
                    <div
                      className="table-row wide"
                      key={wt.path}
                      style={{ gridTemplateColumns: '1.2fr 1fr 1fr auto' }}
                    >
                      <div>
                        <strong title={wt.path} style={{ color: '#ffffff' }}>{folderName}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wt.path}>
                          {wt.path}
                        </div>
                      </div>
                      <div>
                        <span className="badge" style={{ borderColor: '#0ea5e9', color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.08)' }}>
                          {wt.branch || 'detached HEAD'}
                        </span>
                      </div>
                      <div>
                        <code style={{ fontSize: '0.78rem', color: '#9ca3af', background: 'rgba(255,255,255,0.02)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.05)' }}>{wt.head.slice(0, 7)}</code>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {hasSession && (
                          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.15)' }}>
                            Session Active
                          </span>
                        )}
                        {hasLease && (
                          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.15)' }}>
                            Leased
                          </span>
                        )}
                        {!hasSession && !hasLease && (
                          <span className="badge" style={{ color: '#6b7280', borderColor: 'rgba(255,255,255,0.05)' }}>
                            Idle
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>

        {/* Right Column (40%): Active Sessions & Leases */}
        <div style={{ display: 'grid', gap: '20px', alignContent: 'start' }}>
          {/* Active Sessions */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Active Sessions</h3>
              <span className="badge">{sessions.length} running</span>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {sessions.length === 0 ? (
                <div className="empty-state compact">No active agent sessions.</div>
              ) : (
                sessions.map((sess) => (
                  <div key={sess.session_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="status-dot active" />
                        <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>PID {sess.pid}</strong>
                      </div>
                      <span className="badge" style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{sess.session_id.slice(0, 8)}</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#d1d5db', margin: '4px 0' }}>
                      Command: <code>{sess.command}</code>
                    </div>
                    {sess.task_id && (
                      <div style={{ fontSize: '0.8rem', color: '#0ea5e9' }}>
                        Task: {sess.task_id} {sess.step ? `/ Step: ${sess.step}` : ''}
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Updated: {new Date(sess.updated_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>

          {/* Lease Locks */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Lease Locks</h3>
              <span className="badge">{leases.length} active</span>
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {leases.length === 0 ? (
                <div className="empty-state compact">No active lease locks.</div>
              ) : (
                leases.map((lease, idx) => (
                  <div key={`${lease.resource}-${idx}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <strong style={{ fontSize: '0.9rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lease.resource}>
                        {lease.resource.split('/').pop() || lease.resource}
                      </strong>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="pulse-indicator" style={{ marginRight: '6px' }} />
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.15)', fontSize: '0.75rem' }}>
                          LOCKED
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#d1d5db', margin: '4px 0' }}>
                      Session: <code>{lease.session_id.slice(0, 8)}</code> (PID {lease.pid})
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#0ea5e9' }}>
                      Task: {lease.task_id} {lease.step ? `/ Step: ${lease.step}` : ''}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Expires: {new Date(lease.expires_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
