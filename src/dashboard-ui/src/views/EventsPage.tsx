import { useMemo, useState } from 'react';
import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

export function EventsPage({ data }: { data: DashboardData }) {
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const isAll = data.selectedRoot === ALL_PROJECTS;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.events.filter((event) => {
      return (source === 'all' || event.source === source) &&
        (!q || `${event.message} ${event.task_id || ''} ${event.step || ''}`.toLowerCase().includes(q));
    });
  }, [data.events, query, source]);

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Events</h2>
          <span>All Projects summary</span>
        </div>
        <div className="table-surface">
          {data.summary?.snapshots.map((snapshot) => (
            <button className="table-row wide" key={snapshot.project.root} onClick={() => data.selectProject(snapshot.project.root)} type="button">
              <strong>{snapshot.project.name}</strong>
              <span>{snapshot.events.latest?.source || 'no events'}</span>
              <span>{snapshot.events.latest?.message || '-'}</span>
              <small>{snapshot.events.count}{snapshot.events.truncated ? '+' : ''}</small>
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
        <span>Showing latest {data.events.length}{data.eventsTruncated ? '+' : ''}</span>
      </div>

      <div className="filter-bar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events" type="search" />
        <select value={source} onChange={(event) => setSource(event.target.value)} aria-label="Event source">
          {['all', 'breadcrumb', 'check', 'review'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="timeline">
        {filtered.length === 0 ? (
          <div className="empty-state">No events match the current filters</div>
        ) : filtered.map((event, index) => (
          <article className="timeline-row" key={`${event.source}-${event.time}-${index}`}>
            <div className={`timeline-dot ${event.severity}`} />
            <div>
              <div className="timeline-meta">
                <strong>{event.source}</strong>
                <span>{event.status}</span>
                <small>{event.time || 'time unknown'}</small>
              </div>
              <p>{event.message}</p>
              {(event.task_id || event.step) && <small>{event.task_id || '-'} / {event.step || '-'}</small>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
