import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function groupName(snapshot: NonNullable<DashboardData['summary']>['snapshots'][number]): string {
  if (snapshot.project.status === 'unavailable') return 'Blocked';
  const phase = snapshot.state?.phase || snapshot.project.phase || 'idle';
  const gate = snapshot.state?.gate || snapshot.project.gate || 'none';
  if (gate.includes('fail') || phase === 'blocked') return 'Blocked';
  if (phase === 'executing') return 'Active';
  if (phase === 'planning' || phase === 'drafting') return 'Planning';
  if (phase === 'completed') return 'Completed';
  return 'Idle';
}

export function TasksPage({ data }: { data: DashboardData }) {
  const isAll = data.selectedRoot === ALL_PROJECTS;
  const groups = ['Blocked', 'Active', 'Planning', 'Completed', 'Idle'];

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Tasks</h2>
          <span>All Projects</span>
        </div>
        {groups.map((group) => {
          const items = data.summary?.snapshots.filter((snapshot) => groupName(snapshot) === group) || [];
          if (items.length === 0) return null;
          return (
            <article className="panel" key={group}>
              <div className="panel-heading">
                <h3>{group}</h3>
                <span>{items.length}</span>
              </div>
              <div className="table-surface embedded">
                {items.map((snapshot) => (
                  <button className="table-row wide" key={snapshot.project.root} onClick={() => data.selectProject(snapshot.project.root)} type="button">
                    <strong>{snapshot.project.name}</strong>
                    <span>{snapshot.state?.task_title || snapshot.state?.task_id || snapshot.project.task_title || 'No active task'}</span>
                    <span>{snapshot.state?.phase || snapshot.project.phase} / {snapshot.state?.gate || snapshot.project.gate}</span>
                    <small>{snapshot.task_progress.done}/{snapshot.task_progress.total} steps</small>
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    );
  }

  const snapshot = data.selectedSnapshot;
  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Tasks</h2>
        <span>{snapshot?.state?.phase || 'selected project'}</span>
      </div>

      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>Current Task</h3>
            <span>{snapshot?.state?.gate || 'none'}</span>
          </div>
          {snapshot ? (
            <dl className="detail-list">
              <div><dt>Task</dt><dd>{snapshot.state?.task_title || snapshot.state?.task_id || 'No active task'}</dd></div>
              <div><dt>Phase</dt><dd>{snapshot.state?.phase || snapshot.project.phase || 'idle'}</dd></div>
              <div><dt>Current step</dt><dd>{snapshot.task_progress.current_step || '-'}</dd></div>
              <div><dt>Progress</dt><dd>{snapshot.task_progress.done}/{snapshot.task_progress.total}</dd></div>
              <div><dt>Blocked steps</dt><dd>{snapshot.task_progress.blocked}</dd></div>
            </dl>
          ) : (
            <div className="empty-state compact">No project selected</div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Closeout Signals</h3>
            <span>{snapshot?.install_health.passed ? 'healthy' : 'attention'}</span>
          </div>
          {snapshot ? (
            <dl className="detail-list">
              <div><dt>Latest check</dt><dd>{snapshot.check.latest ? (snapshot.check.latest.passed ? 'PASS' : 'FAIL') : 'none'}</dd></div>
              <div><dt>Review</dt><dd>{snapshot.review.status}</dd></div>
              <div><dt>Install</dt><dd>{snapshot.install_health.passed ? 'PASS' : snapshot.install_health.issue_ids.join(', ')}</dd></div>
              <div><dt>Route</dt><dd>{snapshot.route.recommended_command || snapshot.route.next_action}</dd></div>
            </dl>
          ) : (
            <div className="empty-state compact">Select a project for closeout state</div>
          )}
        </article>
      </div>

      <article className="panel">
        <div className="panel-heading">
          <h3>Plan Summary</h3>
          <span>{snapshot?.task_progress.total || 0} steps</span>
        </div>
        <div className="progress-bar" aria-label="Task progress">
          <span style={{ width: `${snapshot?.task_progress.total ? (snapshot.task_progress.done / snapshot.task_progress.total) * 100 : 0}%` }} />
        </div>
      </article>
    </section>
  );
}
