import type { DashboardData } from '../state/useDashboardData';

export function GatesPage({ data }: { data: DashboardData }) {
  const passed = data.checks.filter((check) => check.passed).length;
  const failed = data.checks.length - passed;
  const review = data.review?.summary;

  return (
    <section className="view-stack">
      <div className="view-heading">
        <h2>门禁</h2>
        <span>{data.review?.summary.status || 'unknown'}</span>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Check PASS</span>
          <strong>{passed}</strong>
        </article>
        <article className="metric-card">
          <span>Check FAIL</span>
          <strong>{failed}</strong>
        </article>
        <article className="metric-card">
          <span>Review 错误</span>
          <strong>{review?.errors ?? '-'}</strong>
        </article>
        <article className="metric-card">
          <span>Review 警告</span>
          <strong>{review?.warnings ?? '-'}</strong>
        </article>
      </div>

      <div className="table-surface">
        {data.checks.length === 0 ? (
          <div className="empty-state">暂无 Check 记录</div>
        ) : data.checks.map((check) => (
          <div className="table-row" key={check.timestamp}>
            <strong>{check.passed ? 'PASS' : 'FAIL'}</strong>
            <span>{check.failedChecks.length ? check.failedChecks.join(', ') : '0 failures'}</span>
            <small>{check.timestamp}</small>
          </div>
        ))}
      </div>

      <article className="panel">
        <div className="panel-heading">
          <h3>Review</h3>
          <span>{review?.status || 'unknown'}</span>
        </div>
        {data.review?.markdown ? (
          <pre className="review-block">{data.review.markdown}</pre>
        ) : (
          <div className="empty-state compact">暂无 Review</div>
        )}
      </article>
    </section>
  );
}
