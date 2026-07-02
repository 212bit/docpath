---
approval:
  state: approved
  approved_at: 2026-06-20T00:00:00.000+08:00
  source: user-confirmed-chat-approval-enter-development
  forbidden_directions:
    - browser command execution
    - backlog or workflow state mutation from UI
    - project registration or deletion from UI
    - remote public dashboard
    - marketing hero layout
---

# Design Approval - Multi-project DocPath Dashboard

## Approval Source

The user approved entering development after reviewing the v2 UI direction, then explicitly instructed: "进入开发".

## Approved At

2026-06-20T00:00:00.000+08:00

## Approved Direction

Build a local read-only multi-project operations console with:

- Multi-project first shell: project rail, status filters, local cwd fallback, stale/unavailable markers.
- Sticky top route band: selected project, phase/gate/current step, next action, recommended command, refresh, read-only mode.
- Primary views: Overview, Backlog, Tasks, Gates, Events.
- Dense operational presentation: metric strips, attention queue, tables, inline detail panels, bounded event timeline.
- Project scope model: `All Projects` for summaries; concrete selected project for detail reads.
- Safety model: no command execution, no write actions, no project registration/deletion in browser.

## Approved UI Decisions

1. `All Projects` is allowed as a pseudo-project at the top of the rail for summary views.
2. Recommended commands may have a clipboard-only `Copy` affordance, with no execution behavior.
3. Events is a primary navigation item.
4. Details use inline split panels on desktop and below-row expansion on mobile.
5. The dashboard keeps the dark sidebar style while increasing density and status clarity.

## Forbidden Directions

- No browser command execution.
- No backlog, task, workflow state, project registration, or project deletion mutation from the UI.
- No remote public dashboard or multi-user permission system in this MVP.
- No marketing hero layout or decorative landing-page treatment.
- No unbounded cross-project event log loading.
