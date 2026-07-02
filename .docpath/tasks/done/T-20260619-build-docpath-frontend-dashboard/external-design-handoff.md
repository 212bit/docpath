# External Design Handoff - Multi-project DocPath Dashboard

## Source

No external Stitch, Figma, v0, or Framer file is used for this MVP. This handoff records the internal design prompt, output, selected direction, rejected direction, and constraints so the implementation remains reviewable without external assets.

## Prompt

Design a local read-only multi-project DocPath operations console for operators and agent sessions. It must show project registry state, current route, recommended command, backlog, tasks, gates, and recent events. It must be dense, operational, responsive, and safe by design.

## Output

The generated direction is a multi-project dashboard with:

- Dark project rail and primary navigation.
- Sticky top route band.
- Overview, Backlog, Tasks, Gates, and Events routes.
- Compact metrics, tables, filters, inline detail panels, and bounded timeline.
- Read-only status visible in chrome.

## Selected Direction

Selected: operational console layout using the existing React/Vite dashboard and read-only API. This fits DocPath dogfood usage and preserves local safety boundaries.

## Rejected Directions

Rejected:

- Marketing hero page.
- Decorative admin template with low data density.
- Browser command execution center.
- Full daemon/watcher management UI.
- Modal-first details for routine scanning.

## Constraints

- Must remain local and read-only.
- Must not expose command execution endpoint.
- Must not mutate backlog, task state, project registry, or workflow state.
- Must use structured JSON/JSONL where possible instead of Markdown parsing.
- Must handle stale/unavailable/unknown schema projects.
- Must keep cross-project event reads bounded.
