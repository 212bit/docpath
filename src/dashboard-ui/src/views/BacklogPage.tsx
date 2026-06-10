import type { DashboardData } from '../state/useDashboardData';

export function BacklogPage({ data }: { data: DashboardData }) {
  const statusCounts = data.backlog.reduce<Record<string, number>>((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const priorityCounts = data.backlog.reduce<Record<string, number>>((counts, item) => {
    counts[item.priority] = (counts[item.priority] || 0) + 1;
    return counts;
  }, {});

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>Backlog</h2>
        <span>{data.backlog.length}</span>
      </div>

      <div className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>状态</h3>
            <span>{Object.keys(statusCounts).length}</span>
          </div>
          {Object.keys(statusCounts).length === 0 ? (
            <div className="empty-state compact">暂无状态</div>
          ) : Object.entries(statusCounts).map(([status, count]) => (
            <div className="count-row" key={status}>
              <span>{status}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <h3>优先级</h3>
            <span>{Object.keys(priorityCounts).length}</span>
          </div>
          {Object.keys(priorityCounts).length === 0 ? (
            <div className="empty-state compact">暂无优先级</div>
          ) : Object.entries(priorityCounts).map(([priority, count]) => (
            <div className="count-row" key={priority}>
              <span>{priority}</span>
              <strong>{count}</strong>
            </div>
          ))}
        </article>
      </div>

      <div className="table-surface">
        {data.backlog.length === 0 ? (
          <div className="empty-state">暂无 Backlog</div>
        ) : data.backlog.map((item) => (
          <div className="table-row wide" key={item.id}>
            <strong>{item.id} · {item.title}</strong>
            <span>{item.status} / {item.priority}</span>
            <small>Level {item.level}</small>
            <small>{item.created_at}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
