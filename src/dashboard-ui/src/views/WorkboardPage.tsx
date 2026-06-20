import { useMemo, useState } from 'react';
import type { BacklogItem } from '../lib/api';
import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function matches(value: string, expected: string): boolean {
  return expected === 'all' || value === expected;
}

function taskGroupName(snapshot: NonNullable<DashboardData['summary']>['snapshots'][number]): string {
  if (snapshot.project.status === 'unavailable') return 'Blocked';
  const phase = snapshot.state?.phase || snapshot.project.phase || 'idle';
  const gate = snapshot.state?.gate || snapshot.project.gate || 'none';
  if (gate.includes('fail') || phase === 'blocked') return 'Blocked';
  if (phase === 'executing') return 'Active';
  if (phase === 'planning' || phase === 'drafting') return 'Planning';
  if (phase === 'completed') return 'Completed';
  return 'Idle';
}

export function WorkboardPage({ data }: { data: DashboardData }) {
  const [activeTab, setActiveTab] = useState<'plan' | 'backlog'>('plan');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [readinessFilter, setReadinessFilter] = useState('all');
  const [selectedBacklogId, setSelectedBacklogId] = useState<string | null>(null);

  const isAll = data.selectedRoot === ALL_PROJECTS;
  const groups = ['Blocked', 'Active', 'Planning', 'Completed', 'Idle'];

  // Filter Backlog items
  const filteredBacklog = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.backlog.filter((item) => {
      const text = `${item.id} ${item.title} ${item.body}`.toLowerCase();
      return (
        (!q || text.includes(q)) &&
        matches(item.status, statusFilter) &&
        matches(item.priority, priorityFilter) &&
        matches(item.readiness || 'raw', readinessFilter)
      );
    });
  }, [data.backlog, query, statusFilter, priorityFilter, readinessFilter]);

  const selectedBacklog = filteredBacklog.find((item) => item.id === selectedBacklogId) || filteredBacklog[0] || null;

  // Cross-project View (All Projects)
  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Workboard</h2>
          <span>All Projects Summary</span>
        </div>

        <div className="split-grid wide-left">
          {/* Left: Cross-Project Tasks Status */}
          <div style={{ display: 'grid', gap: '20px' }}>
            {groups.map((group) => {
              const items = data.summary?.snapshots.filter((snapshot) => taskGroupName(snapshot) === group) || [];
              if (items.length === 0) return null;
              return (
                <article className="panel" key={group}>
                  <div className="panel-heading">
                    <h3>{group} Projects</h3>
                    <span className="badge">{items.length}</span>
                  </div>
                  <div className="table-surface">
                    {items.map((snapshot) => (
                      <button
                        className="table-row wide"
                        key={snapshot.project.root}
                        onClick={() => data.selectProject(snapshot.project.root)}
                        type="button"
                      >
                        <strong>{snapshot.project.name}</strong>
                        <span>{snapshot.state?.task_title || snapshot.state?.task_id || 'No active task'}</span>
                        <small style={{ background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', padding: '2px 6px', color: '#9ca3af' }}>
                          {snapshot.task_progress.done} / {snapshot.task_progress.total} steps
                        </small>
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Right: Cross-Project Backlog Counts */}
          <article className="panel" style={{ alignSelf: 'start' }}>
            <div className="panel-heading">
              <h3>Backlog Summary</h3>
              <span className="badge">{data.summary?.snapshots.length ?? 0}</span>
            </div>
            <div className="table-surface">
              {data.summary?.snapshots.length ? (
                data.summary.snapshots.map((snapshot) => (
                  <button
                    className="table-row"
                    key={snapshot.project.root}
                    onClick={() => data.selectProject(snapshot.project.root)}
                    type="button"
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <strong>{snapshot.project.name}</strong>
                    <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                      P: {snapshot.backlog_counts.proposed || 0} / A: {snapshot.backlog_counts.accepted || 0}
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty-state">No snapshot data</div>
              )}
            </div>
          </article>
        </div>
      </section>
    );
  }

  // Single-project View
  const selectedSnapshot = data.selectedSnapshot;

  return (
    <section className="view-stack">
      {/* Sub-tab Switcher */}
      <div className="view-heading">
        <h2>{data.selectedProject?.name || 'Project Workboard'}</h2>
        <div className="chip-row" style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '3px', borderRadius: '8px', background: 'rgba(17,24,39,0.5)' }}>
          <button
            onClick={() => setActiveTab('plan')}
            className="chip"
            style={{
              border: 'none',
              borderRadius: '6px',
              height: '32px',
              background: activeTab === 'plan' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
              color: activeTab === 'plan' ? '#0ea5e9' : '#6b7280',
              fontWeight: activeTab === 'plan' ? 600 : 500,
            }}
            type="button"
          >
            Active Task Plan
          </button>
          <button
            onClick={() => setActiveTab('backlog')}
            className="chip"
            style={{
              border: 'none',
              borderRadius: '6px',
              height: '32px',
              background: activeTab === 'backlog' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
              color: activeTab === 'backlog' ? '#0ea5e9' : '#6b7280',
              fontWeight: activeTab === 'backlog' ? 600 : 500,
            }}
            type="button"
          >
            Backlog Pool ({data.backlog.length})
          </button>
        </div>
      </div>

      {activeTab === 'plan' ? (
        // PLAN TAB
        <div style={{ display: 'grid', gap: '20px' }}>
          <div className="split-grid">
            {/* Active task details */}
            <article className="panel">
              <div className="panel-heading">
                <h3>Current Task Info</h3>
                <span className="badge">{selectedSnapshot?.state?.phase || 'idle'}</span>
              </div>
              <dl className="detail-list">
                <div><dt>Task ID / Title</dt><dd style={{ fontWeight: 600, color: '#ffffff' }}>{selectedSnapshot?.state?.task_title || selectedSnapshot?.state?.task_id || 'No active task'}</dd></div>
                <div><dt>Phase</dt><dd>{selectedSnapshot?.state?.phase || 'idle'}</dd></div>
                <div><dt>Current Step</dt><dd>{selectedSnapshot?.task_progress.current_step || '-'}</dd></div>
              </dl>
            </article>

            {/* Task progress card */}
            <article className="panel">
              <div className="panel-heading">
                <h3>Checklist Progress</h3>
                <span className="badge">{selectedSnapshot?.task_progress.done} / {selectedSnapshot?.task_progress.total} done</span>
              </div>
              <div className="progress-bar" aria-label="Task progress" style={{ margin: '14px 0' }}>
                <span
                  style={{
                    width: `${
                      selectedSnapshot?.task_progress.total
                        ? (selectedSnapshot.task_progress.done / selectedSnapshot.task_progress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              <dl className="detail-list">
                <div><dt>Total Steps</dt><dd>{selectedSnapshot?.task_progress.total ?? 0}</dd></div>
                <div><dt>Blocked Steps</dt><dd>{selectedSnapshot?.task_progress.blocked ?? 0}</dd></div>
              </dl>
            </article>
          </div>

          {/* Steps Checklist list */}
          <article className="panel">
            <div className="panel-heading">
              <h3>Plan Execution Steps</h3>
              <span className="badge">{data.steps.length} steps</span>
            </div>
            <div className="table-surface">
              {data.steps.length === 0 ? (
                <div className="empty-state">No steps in the active plan checklist. Generate a plan first.</div>
              ) : (
                data.steps.map((step) => {
                  let statusClass = 'pending';
                  let statusText = 'Pending';
                  if (step.marker === 'x') {
                    statusClass = 'active';
                    statusText = 'Completed';
                  } else if (step.marker === '!') {
                    statusClass = 'blocked';
                    statusText = 'Blocked';
                  } else if (step.marker === '~') {
                    statusClass = 'partial';
                    statusText = 'Skipped';
                  }
                  const isCurrent = selectedSnapshot?.task_progress.current_step === step.id;

                  return (
                    <div
                      className={`table-row ${isCurrent ? 'selected' : ''}`}
                      key={step.id}
                      style={{ gridTemplateColumns: '80px 1.2fr 1.5fr 1fr 100px', borderLeft: isCurrent ? '3px solid #0ea5e9' : 'none' }}
                    >
                      <strong style={{ color: isCurrent ? '#0ea5e9' : '#ffffff' }}>{step.id}</strong>
                      <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffffff' }}>
                        {step.name}
                      </strong>
                      <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{step.description}</span>
                      <small style={{ color: '#9ca3af' }}>
                        {step.dependencies && step.dependencies !== '无' ? `Dep: ${step.dependencies}` : 'No dependency'}
                      </small>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <i className={`status-dot ${statusClass}`} />
                        <span style={{ fontSize: '0.85rem' }}>{statusText}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>
      ) : (
        // BACKLOG TAB
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Backlog pool filters */}
          <div className="filter-bar">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search id, title, body..."
              type="search"
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Status">
              {['all', 'proposed', 'accepted', 'planned', 'active', 'done', 'dropped'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Priority">
              {['all', 'P0', 'P1', 'P2', 'P3'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)} aria-label="Readiness">
              {['all', 'raw', 'shaped', 'analyzed', 'confirmed'].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {/* Grid & detail drawer split */}
          <div className="split-grid wide-left">
            {filteredBacklog.length === 0 ? (
              <div className="panel empty-state">
                {data.backlog.length === 0 ? 'No backlog items' : 'No matching backlog items found'}
              </div>
            ) : (
              <div className="backlog-grid">
                {filteredBacklog.map((item) => {
                  const isSelected = selectedBacklog?.id === item.id;
                  return (
                    <button
                      className={`backlog-card priority-${item.priority} ${isSelected ? 'selected' : ''}`}
                      key={item.id}
                      onClick={() => setSelectedBacklogId(item.id)}
                      type="button"
                    >
                      <div className="backlog-card-header">
                        <strong>{item.id}: {item.title}</strong>
                      </div>
                      <div className="backlog-card-meta">
                        <span className="badge" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{item.status}</span>
                        <span className="badge" style={{ fontSize: '0.72rem', padding: '2px 8px', color: '#0ea5e9', borderColor: 'rgba(14, 165, 233, 0.15)' }}>{item.priority}</span>
                        <span className="badge" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>L{item.level}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <BacklogDetail item={selectedBacklog} />
          </div>
        </div>
      )}
    </section>
  );
}

function BacklogDetail({ item }: { item: BacklogItem | null }) {
  if (!item) return <article className="panel"><div className="empty-state compact">Select a backlog item</div></article>;
  const excerpt = item.body.length > 700 ? `${item.body.slice(0, 700)}...` : item.body;
  return (
    <article className="panel detail-panel" style={{ position: 'sticky', top: '10px' }}>
      <div className="panel-heading">
        <h3>{item.id}</h3>
        <span className="badge">{item.status}</span>
      </div>
      <h4 style={{ margin: '8px 0 12px', fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
        {item.title}
      </h4>
      <dl className="detail-list">
        <div><dt>Priority</dt><dd style={{ color: '#ffffff', fontWeight: 600 }}>{item.priority}</dd></div>
        <div><dt>Readiness</dt><dd>{item.readiness || 'raw'}</dd></div>
        <div><dt>Difficulty Level</dt><dd>L{item.level}</dd></div>
        <div><dt>Linked Task</dt><dd>{item.links?.task || '-'}</dd></div>
        <div><dt>Linked Spec</dt><dd>{item.links?.spec || '-'}</dd></div>
      </dl>
      <pre className="excerpt-block">{excerpt || 'No body content available'}</pre>
    </article>
  );
}
