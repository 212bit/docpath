## Risks

- Data loss risk: migrating or splitting breadcrumb history must preserve existing workspace/breadcrumb.jsonl and markdown-only entries until tests prove the new task-scoped source is equivalent.
- Compatibility risk: many commands consume readBreadcrumb without explicit task options; changing its default semantics too aggressively can hide historical evidence needed by journal, stats, export, or dashboard.
- Drift risk: plan/breadcrumb drift checks need task-specific evidence, but stale historical entries from previous tasks must still be available for archive/journal views.
- Performance risk: a naive implementation that reads all task breadcrumb files to build summaries would trade one unbounded file for many files; active-task reads should be bounded by taskId and only aggregate history for explicit reporting commands.
- Cleanup risk: compact --cleanup and gc currently understand the global workspace breadcrumb files; either keep legacy cleanup semantics or update cleanup to avoid orphaned task-scoped breadcrumbs.

## Open Decisions
- Default readBreadcrumb semantics should likely remain backward compatible and return the active task plus bounded recent global events, while a task-specific helper provides stricter reads for drift and current-step inference.
- Storage shape should be chosen to minimize call-site churn: task-local breadcrumb.jsonl is natural because task artifacts already live under .docpath/tasks/<taskId>/, but workspace/breadcrumb.md can remain the rendered recent view for humans.
- Migration should be lazy and reversible: do not delete legacy global files in the first implementation; only stop appending unbounded events once the task-scoped path is active.