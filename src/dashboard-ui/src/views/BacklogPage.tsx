import { useMemo, useState } from 'react';
import type { BacklogItem } from '../lib/api';
import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function matches(value: string, expected: string): boolean {
  return expected === 'all' || value === expected;
}

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

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Backlog</h2>
          <span>All Projects summary</span>
        </div>
        <div className="table-surface">
          {data.summary?.snapshots.length ? data.summary.snapshots.map((snapshot) => (
            <button className="table-row wide" key={snapshot.project.root} onClick={() => data.selectProject(snapshot.project.root)} type="button">
              <strong>{snapshot.project.name}</strong>
              <span>proposed {snapshot.backlog_counts.proposed || 0} / accepted {snapshot.backlog_counts.accepted || 0}</span>
              <span>done {snapshot.backlog_counts.done || 0}</span>
              <small>{snapshot.project.status || 'ok'}</small>
            </button>
          )) : (
            <div className="empty-state">No projects available</div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Backlog</h2>
        <span>{filtered.length} / {data.backlog.length}</span>
      </div>

      <div className="filter-bar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search id, title, body" type="search" />
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Status">
          {['all', 'proposed', 'accepted', 'planned', 'active', 'done', 'dropped'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Priority">
          {['all', 'P0', 'P1', 'P2', 'P3'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={readiness} onChange={(event) => setReadiness(event.target.value)} aria-label="Readiness">
          {['all', 'raw', 'shaped', 'analyzed', 'confirmed'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="split-grid wide-left">
        <div className="table-surface">
          {filtered.length === 0 ? (
            <div className="empty-state">{data.backlog.length === 0 ? 'No backlog items' : 'No backlog items match filters'}</div>
          ) : filtered.map((item) => (
            <button
              className={selected?.id === item.id ? 'table-row backlog selected' : 'table-row backlog'}
              key={item.id}
              onClick={() => setSelectedId(item.id)}
              type="button"
            >
              <strong>{item.id} · {item.title}</strong>
              <span>{item.status} / {item.priority}</span>
              <span>{item.readiness || 'raw'} · L{item.level}</span>
            </button>
          ))}
        </div>

        <BacklogDetail item={selected} />
      </div>
    </section>
  );
}

function BacklogDetail({ item }: { item: BacklogItem | null }) {
  if (!item) return <article className="panel"><div className="empty-state compact">Select a backlog item</div></article>;
  const excerpt = item.body.length > 700 ? `${item.body.slice(0, 700)}...` : item.body;
  return (
    <article className="panel detail-panel">
      <div className="panel-heading">
        <h3>{item.id}</h3>
        <span>{item.status}</span>
      </div>
      <h4>{item.title}</h4>
      <dl className="detail-list">
        <div><dt>Priority</dt><dd>{item.priority}</dd></div>
        <div><dt>Readiness</dt><dd>{item.readiness || 'raw'}</dd></div>
        <div><dt>Level</dt><dd>{item.level}</dd></div>
        <div><dt>Task</dt><dd>{item.links?.task || '-'}</dd></div>
        <div><dt>Spec</dt><dd>{item.links?.spec || '-'}</dd></div>
      </dl>
      <pre className="excerpt-block">{excerpt || 'No body content'}</pre>
    </article>
  );
}
