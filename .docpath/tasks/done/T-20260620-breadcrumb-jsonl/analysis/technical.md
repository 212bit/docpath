## Technical Analysis

### Affected Modules
- Core write/read boundary: src/engine/breadcrumb.ts owns BreadcrumbEntry, JSONL validation, append, migration from markdown, rendering breadcrumb.md, readBreadcrumb, readRecentBreadcrumbEntries, and duplicate done handling.
- Cleanup boundary: src/utils/workspace-cleanup.ts currently prunes workspace/breadcrumb.jsonl globally at cleanup time and preserves terminal events for currentTaskId.
- Read consumers: next/status/reveal/context/check/journal/runtime/dashboard/export/stats/current-step-inference/pending-done call readBreadcrumb or readRecentBreadcrumbEntries and should keep their public behavior while reading the active task slice where appropriate.
- Legacy human views: workspace/breadcrumb.md remains a rendered/rebuildable view and should not become the new truth source.

### Implementation Boundary
- Prefer adding task-scoped JSONL storage under .docpath/tasks/<taskId>/breadcrumb.jsonl or an equivalent task-indexed helper behind breadcrumb.ts, while keeping workspace/breadcrumb.jsonl readable as legacy/global source.
- Keep writeBreadcrumb as the single write API. It can route entries with taskId to task-scoped storage and update the rendered workspace/breadcrumb.md view from a bounded recent/task-aware set.
- Keep readBreadcrumb backward compatible. Existing callers should continue to work; add optional task-aware helpers or options only if needed to avoid changing every call site at once.
- Existing projects with only workspace/breadcrumb.jsonl or breadcrumb.md must still read successfully. Migration can be lazy on write/read and must not lose existing events.
- Growth control should happen at the storage boundary, not only in compact --cleanup. The active task should not require scanning unlimited global history.

### Test Strategy
- Extend tests/breadcrumb.test.mjs for task boundary writes, legacy global JSONL fallback, markdown-only migration, and task switching.
- Extend next/check/current-step-inference or plan-sync coverage where stale events from another task currently affect routing or drift.
- Update runtime cleanup tests if the global breadcrumb retention policy changes, preserving explicit cleanup behavior for legacy/global files.
- Run pnpm run build:test, focused breadcrumb/next/check tests, then pnpm test and docpath check before closeout.