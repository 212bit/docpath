import type { DashboardData } from '../state/useDashboardData';

export function TasksPage({ data }: { data: DashboardData }) {
  const projectTasks = data.projects
    .filter((project) => project.task_id || project.task_title)
    .map((project) => ({
      key: project.root,
      title: project.task_title || project.task_id,
      id: project.task_id,
      project: project.name || project.root,
      phase: project.phase,
      gate: project.gate,
      updated: project.last_seen_at,
    }));
  const tasks = projectTasks.length > 0 ? projectTasks : data.state?.task_id ? [{
    key: 'current',
    title: data.state.task_title || data.state.task_id,
    id: data.state.task_id,
    project: '本地工作区',
    phase: data.state.phase || '-',
    gate: data.state.gate || '-',
    updated: data.state.updated_at || '-',
  }] : [];

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>任务</h2>
        <span>{tasks.length}</span>
      </div>
      <div className="table-surface">
        {tasks.length === 0 ? (
          <div className="empty-state">暂无任务</div>
        ) : tasks.map((task) => (
          <div className="table-row wide" key={task.key}>
            <strong>{task.title}</strong>
            <span>{task.project}</span>
            <span>{task.phase} / {task.gate}</span>
            <small>{task.updated}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
