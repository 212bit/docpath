import { useMemo, useState } from 'react';
import type { BacklogItem } from '../lib/api';
import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function matches(value: string, expected: string) {
  return expected === 'all' || value === expected;
}

const PRIORITY_CLASS: Record<string, string> = { P0: 'p0', P1: 'p1', P2: 'p2', P3: 'p3' };

export function BacklogPage({ data }: { data: DashboardData }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [readiness, setReadiness] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isAll = data.selectedRoot === ALL_PROJECTS;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.backlog.filter((item) => {
      const text = `${item.id} ${item.title} ${item.body}`.toLowerCase();
      return (!q || text.includes(q)) &&
        matches(item.status, status) &&
        matches(item.priority, priority) &&
        matches(item.readiness || 'raw', readiness);
    });
  }, [data.backlog, query, status, priority, readiness]);

  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Backlog</h2>
          <span className="hint">All Projects</span>
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
              <span>proposed {snap.backlog_counts.proposed ?? 0}</span>
              <span>accepted {snap.backlog_counts.accepted ?? 0}</span>
              <small>{snap.backlog_counts.done ?? 0} done</small>
            </button>
          )) : <div className="empty">No projects available</div>}
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Backlog</h2>
        <span className="hint">{filtered.length} / {data.backlog.length} items</span>
      </div>

      <div className="filter-bar">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search id, title, body…" type="search" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {['all', 'proposed', 'accepted', 'planned', 'active', 'done', 'dropped'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {['all', 'P0', 'P1', 'P2', 'P3'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={readiness} onChange={(e) => setReadiness(e.target.value)} aria-label="Readiness">
          {['all', 'raw', 'shaped', 'analyzed', 'confirmed'].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      <div className="split-grid split-grid-wide">
        {filtered.length === 0 ? (
          <div className="panel empty">{data.backlog.length === 0 ? 'No backlog items' : 'No items match filters'}</div>
        ) : (
          <div className="backlog-grid">
            {filtered.map((item) => (
              <button
                key={item.id}
                className={`backlog-card ${PRIORITY_CLASS[item.priority] ?? ''} ${selected?.id === item.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <div className="backlog-card-title">{item.id}: {item.title}</div>
                <div className="backlog-card-meta">
                  <span className="badge">{item.status}</span>
                  <span className="badge accent">{item.priority}</span>
                  <span className="badge">L{item.level}</span>
                  {item.readiness && item.readiness !== 'raw' && <span className="badge">{item.readiness}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
        <BacklogDetail item={selected} />
      </div>
    </section>
  );
}

function BacklogDetail({ item }: { item: BacklogItem | null }) {
  if (!item) {
    return (
      <article className="panel">
        <div className="empty inline">Select an item to inspect</div>
      </article>
    );
  }
  const excerpt = item.body.length > 800 ? `${item.body.slice(0, 800)}…` : item.body;
  return (
    <article className="panel" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
      <div className="panel-heading">
        <h3 style={{ fontFamily: 'var(--font-mono)' }}>{item.id}</h3>
        <span className="badge">{item.status}</span>
      </div>
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12, lineHeight: 1.4 }}>
        {item.title}
      </div>
      <div className="detail-list" style={{ marginBottom: 12 }}>
        <dl><dt>Priority</dt><dd style={{ fontWeight: 600 }}>{item.priority}</dd></dl>
        <dl><dt>Readiness</dt><dd>{item.readiness || 'raw'}</dd></dl>
        <dl><dt>Level</dt><dd>L{item.level}</dd></dl>
        <dl><dt>Linked Task</dt><dd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{item.links?.task || '-'}</dd></dl>
        <dl><dt>Linked Spec</dt><dd style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{item.links?.spec || '-'}</dd></dl>
      </div>
      <pre className="code-block">{excerpt || 'No body content'}</pre>
    </article>
  );
}
