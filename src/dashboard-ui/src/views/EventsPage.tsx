import { useMemo, useState } from 'react';
import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

const SOURCES = ['all', 'breadcrumb', 'check', 'review'] as const;

export function EventsPage({ data }: { data: DashboardData }) {
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const isAll = data.selectedRoot === ALL_PROJECTS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.events.filter((ev) =>
      (source === 'all' || ev.source === source) &&
      (!q || `${ev.message} ${ev.task_id ?? ''} ${ev.step ?? ''}`.toLowerCase().includes(q))
    );
  }, [data.events, source, query]);

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Events</h2>
          <span className="hint">All Projects</span>
        </div>
        <div className="table-surface">
          {data.summary?.snapshots.map((snap) => (
            <button
              key={snap.project.root}
              className="table-row col-4"
              onClick={() => data.selectProject(snap.project.root)}
              type="button"
            >
              <strong>{snap.project.name}</strong>
              <span>{snap.events.latest?.source || 'no events'}</span>
              <span>{snap.events.latest?.message || '-'}</span>
              <small style={{ fontFamily: 'var(--font-mono)' }}>{snap.events.count}{snap.events.truncated ? '+' : ''}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Events</h2>
        <span className="hint">
          {filtered.length} / {data.events.length} shown
          {data.eventsTruncated ? ' (truncated)' : ''}
        </span>
      </div>

      <div className="filter-bar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search events…" type="search" />
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Event source">
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="table-surface">
        {filtered.length === 0 ? (
          <div className="empty">No events match the current filters</div>
        ) : (
          <div className="timeline">
            {filtered.map((ev, i) => (
              <div key={`${ev.source}-${ev.time}-${i}`} className="timeline-row">
                <span className={`timeline-dot ${ev.severity}`} />
                <div>
                  <div className="timeline-meta">
                    <strong style={{ color: ev.severity === 'fail' || ev.severity === 'blocked' ? 'var(--color-status-fail)' : ev.severity === 'warning' ? 'var(--color-status-warn)' : ev.severity === 'pass' ? 'var(--color-status-active)' : 'var(--color-accent)' }}>
                      {ev.source.toUpperCase()}
                    </strong>
                    <span>{ev.status}</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{ev.time ? new Date(ev.time).toLocaleTimeString() : '—'}</span>
                    {(ev.task_id || ev.step) && (
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent)' }}>
                        {ev.task_id || '-'}/{ev.step || '-'}
                      </span>
                    )}
                  </div>
                  <div className="timeline-msg">{ev.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
