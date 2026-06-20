import { ALL_PROJECTS, type DashboardData } from '../state/useDashboardData';

function groupName(snap: NonNullable<DashboardData['summary']>['snapshots'][number]): string {
  if (snap.project.status === 'unavailable') return 'Blocked';
  const phase = snap.state?.phase || snap.project.phase || 'idle';
  const gate = snap.state?.gate || snap.project.gate || 'none';
  if (gate.includes('fail') || phase === 'blocked') return 'Blocked';
  if (phase === 'executing') return 'Active';
  if (phase === 'planning' || phase === 'drafting') return 'Planning';
  if (phase === 'completed') return 'Completed';
  return 'Idle';
}

const GROUPS = ['Blocked', 'Active', 'Planning', 'Completed', 'Idle'] as const;

export function WorkboardPage({
  data,
  onExecuteCommand,
}: {
  data: DashboardData;
  onExecuteCommand?: (root: string | null, action: string, args: Record<string, string>) => void;
}) {
  const isAll = data.selectedRoot === ALL_PROJECTS;
  const selected = data.selectedSnapshot;

  if (isAll) {
    return (
      <section className="view-stack">
        <div className="view-heading">
          <h2>Workboard</h2>
          <span className="hint">All Projects</span>
        </div>
        <div className="view-stack">
          {GROUPS.map((group) => {
            const items = data.summary?.snapshots.filter((s) => groupName(s) === group) ?? [];
            if (items.length === 0) return null;
            return (
              <article className="panel" key={group}>
                <div className="panel-heading">
                  <h3>{group}</h3>
                  <span className="badge">{items.length}</span>
                </div>
                <div className="table-surface inset">
                  {items.map((snap) => (
                    <button
                      key={snap.project.root}
                      className="table-row col-3"
                      onClick={() => data.selectProject(snap.project.root)}
                      type="button"
                    >
                      <strong>{snap.project.name}</strong>
                      <span>{snap.state?.task_title || snap.state?.task_id || 'No active task'}</span>
                      <small style={{ fontFamily: 'var(--font-mono)' }}>{snap.task_progress.done}/{snap.task_progress.total} steps</small>
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Workboard</h2>
        <span className="hint">{data.selectedProject?.name}</span>
      </div>

      {/* Task info + progress */}
      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>Current Task</h3>
            <span className="badge">{selected?.state?.phase || 'idle'}</span>
          </div>
          <div className="detail-list">
            <dl><dt>Task</dt><dd style={{ fontWeight: 600 }}>{selected?.state?.task_title || selected?.state?.task_id || 'No active task'}</dd></dl>
            <dl><dt>Phase</dt><dd>{selected?.state?.phase || 'idle'}</dd></dl>
            <dl><dt>Current Step</dt><dd style={{ fontFamily: 'var(--font-mono)' }}>{selected?.task_progress.current_step || '-'}</dd></dl>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>Progress</h3>
            <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>{selected?.task_progress.done ?? 0}/{selected?.task_progress.total ?? 0}</span>
          </div>
          <div className="progress-bar" style={{ margin: '12px 0' }}>
            <div
              className="progress-fill"
              style={{ width: `${selected?.task_progress.total ? (selected.task_progress.done / selected.task_progress.total) * 100 : 0}%` }}
            />
          </div>
          <div className="detail-list">
            <dl><dt>Total Steps</dt><dd>{selected?.task_progress.total ?? 0}</dd></dl>
            <dl><dt>Blocked Steps</dt><dd>{selected?.task_progress.blocked ?? 0}</dd></dl>
          </div>
        </article>
      </div>

      {/* Plan steps */}
      <article className="panel">
        <div className="panel-heading">
          <h3>Plan Steps</h3>
          <span className="badge">{data.steps.length} steps</span>
        </div>
        <div className="table-surface inset">
          {data.steps.length === 0 ? (
            <div className="empty">No steps in the active plan. Generate a plan first.</div>
          ) : data.steps.map((step) => {
            const isCurrent = selected?.task_progress.current_step === step.id;
            let statusColor = 'var(--color-text-muted)';
            let statusLabel = 'Pending';
            if (step.marker === 'x') { statusColor = 'var(--color-status-active)'; statusLabel = 'Done'; }
            else if (step.marker === '!') { statusColor = 'var(--color-status-fail)'; statusLabel = 'Blocked'; }
            else if (step.marker === '~') { statusColor = 'var(--color-status-warn)'; statusLabel = 'Skipped'; }

            return (
              <div
                key={step.id}
                className={`table-row${isCurrent ? ' selected' : ''}`}
                style={{ gridTemplateColumns: '72px 1fr 1.4fr 80px 180px' }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-muted)' }}>{step.id}</span>
                <strong>{step.name}</strong>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{step.description}</span>
                <span style={{ fontSize: '0.72rem', color: statusColor, fontWeight: 600 }}>{statusLabel}</span>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {step.marker === ' ' && !isCurrent && onExecuteCommand && (
                    <button
                      className="btn sm accent"
                      type="button"
                      onClick={() => onExecuteCommand(selected?.project.root || null, 'go', { step: step.id })}
                    >
                      Claim
                    </button>
                  )}
                  {isCurrent && onExecuteCommand && (
                    <>
                      <button
                        className="btn sm success"
                        type="button"
                        onClick={() => onExecuteCommand(selected?.project.root || null, 'agent', { action: 'step', step: step.id, status: 'done' })}
                      >
                        Done
                      </button>
                      <button
                        className="btn sm danger"
                        type="button"
                        onClick={() => onExecuteCommand(selected?.project.root || null, 'agent', { action: 'step', step: step.id, status: 'blocked' })}
                      >
                        Block
                      </button>
                      <button
                        className="btn sm warn"
                        type="button"
                        onClick={() => onExecuteCommand(selected?.project.root || null, 'agent', { action: 'step', step: step.id, status: 'skipped' })}
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
