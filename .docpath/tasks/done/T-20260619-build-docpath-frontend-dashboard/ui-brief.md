# UI Brief - Multi-project DocPath Dashboard

## Product Context

DocPath already has a local `docpath dashboard` command, read-only API, React/Vite UI, project registry, and basic pages. The product problem is not page existence; it is that the dashboard does not yet work as a daily multi-project operations console for an operator or agent session.

Primary users inspect multiple local DocPath repositories and need to quickly answer:

- Which project needs attention?
- What is the selected project's current route and next command?
- Which backlog or task work is active, blocked, ready, or stale?
- What happened recently across checks, reviews, sessions, and breadcrumbs?

## Design North Star

A dense, calm, read-only operations console. The first viewport is the usable dashboard surface, not a landing page. The UI should help users scan, compare, and drill down without implying that the browser can execute workflow commands.

## Visual Direction

- Dark left rail for project scope and primary navigation.
- Light content area with sticky route band.
- Compact metric strips, dense tables, inline detail panels, and bounded event timeline.
- Status color system: green success, amber warning, red failure, blue info, neutral gray background.
- Operational styling with no decorative hero, no gradient orbs, no marketing composition.

## Anti-goals

- No browser command execution.
- No backlog/task/workflow mutation from UI.
- No project registration or deletion from UI.
- No remote public dashboard or auth system in this MVP.
- No modal-first workflow for routine inspection.
- No landing page or oversized hero treatment.

## Design Tokens

- Radius: 8px max for panels, controls, and badges.
- Spacing: 8px rhythm, dense tables with 12-16px row padding.
- Typography: system sans-serif; monospace only for commands, paths, and ids.
- Desktop rail width: roughly 310px.
- Mobile: natural-height shell, bounded project list, stacked table rows.

## Shared Components

- ProjectRail
- RouteBand
- StatusBadge
- CommandPill
- MetricStrip
- AttentionQueue
- FilterBar
- DataTable
- DetailPanel
- Timeline
- HealthPanel
- EmptyState
- PartialDataBanner
- UnavailableProjectState
