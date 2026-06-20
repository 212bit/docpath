# Design Preview - Multi-project DocPath Dashboard v2

## 1. Design Positioning

DocPath Dashboard should feel like a local operations console, not a marketing site and not a decorative admin template. The first screen must be the working surface: multi-project state, selected project route, and attention items.

The UI optimizes for repeated scanning by an operator or agent session:

- Find the project that needs attention.
- Understand the selected project's current DocPath route.
- Inspect backlog/tasks/gates/events with enough context to decide the next CLI action.
- Preserve read-only safety: observe everything useful, execute nothing from the browser.

## 2. Information Architecture

### Global Shell

Desktop layout:

- Left rail: 280-320px fixed-width project/navigation column.
- Content column: minmax(0, 1fr), with a sticky top route band and scrollable main content.
- Main view max width: none by default. This is an operational dashboard, so wide screens should use available width for tables and comparison.

Mobile/tablet layout:

- Sidebar becomes a top section with collapsible project list.
- Navigation becomes a horizontal tab row.
- Tables become stacked row blocks with label/value pairs.

Primary routes:

1. Overview
2. Backlog
3. Tasks
4. Gates
5. Events

Secondary interaction:

- Selecting a project updates all project-scoped views.
- All Projects mode is allowed for summary views but not for expensive detail reads.
- Detail panels open inline on desktop and full-width below row on mobile. Avoid modal-first behavior for routine inspection.

## 3. Shell And Chrome

### Left Rail

Sections:

1. Brand block
   - `DocPath`
   - `Read-only dashboard`
   - Small local indicator: `local registry`

2. Project controls
   - Search input: filters project name/path.
   - Status chips: `All`, `Active`, `Blocked`, `Stale`, `Unavailable`.
   - Registry summary: `N projects`, `M stale`, `K unavailable`.

3. Project list
   - Each row: status dot, project name, truncated root path, phase/gate mini badges, last seen.
   - Active/blocked projects should rise visually using border/accent, not oversized cards.
   - Current cwd fallback row should be labeled `Local cwd` if absent from registry.

4. Primary nav
   - Icon optional, text required: Overview, Backlog, Tasks, Gates, Events.
   - Keep nav stable; avoid hiding important sections behind dropdowns on desktop.

### Top Route Band

Always visible in project-scoped views.

Left side:

- Project name and root path.
- Status badges: phase, gate, current step.
- Schema/read status: ok, partial, unavailable, unknown schema.

Center:

- `Next action`: one sentence, wraps to 2 lines max before expanding details.
- `Recommended command`: monospace command pill with copy affordance only if implemented safely as clipboard-only. If copy is deferred, render as text only.

Right side:

- Last loaded timestamp.
- Refresh button.
- Read-only indicator.

## 4. Overview View

Purpose: triage across projects and decide where to look next.

Layout:

- Top metric band: 5 compact metrics.
  - Projects
  - Active tasks
  - Blocked projects
  - Failed gates
  - Stale/unavailable

- Main split:
  - Left 60%: Attention queue table.
  - Right 40%: Selected project route summary and health panels.

Attention queue table columns:

- Project
- Attention reason
- Phase
- Gate
- Task
- Last seen
- Next command summary

Sort order:

1. Unavailable project with active task metadata
2. Blocked / failed gate
3. Active executing/planning tasks
4. Pending closeout / review/check required
5. Stale registry entries
6. Idle/completed

Selected project panels:

- Route summary: task id/title, phase, gate, current step, next action, recommended command.
- Health summary: install health, registry status, check latest, review summary.
- Backlog snapshot: accepted/proposed/raw counts, high-priority ready count.
- Recent events: latest 5 events only, with link to Events.

Empty state:

- If registry is empty, still show current cwd as local project.
- If current cwd is not a DocPath project, show a read-only diagnostic state and no mutation command button.

## 5. Backlog View

Purpose: inspect candidates and understand readiness without opening files.

Top controls:

- Project scope segmented control: `Selected Project` / `All Projects`.
- Search input: id, title, body excerpt.
- Status segmented control: proposed, accepted, done, dropped, all.
- Priority segmented control: P0-P3/all.
- Readiness select: raw, shaped, analyzed, confirmed, all.
- Level select: 0-3/all.

All Projects mode:

- Summary table grouped by project.
- Columns: project, proposed, accepted, confirmed, P0/P1, stale/unavailable marker.
- Clicking a project switches selected project and applies the backlog view.

Selected Project mode:

- Backlog table columns:
  - ID
  - Title
  - Status
  - Priority
  - Readiness
  - Level
  - Linked task/spec
  - Created/updated if available

Detail panel:

- Opens when row selected.
- Shows background excerpt, acceptance excerpt, evidence refs, linked task/spec, and status metadata.
- No accept/promote buttons in MVP.

States:

- No backlog files.
- Filters returned zero results.
- Backlog parse partial failure.
- Archived/backlog links missing target.

## 6. Tasks View

Purpose: see active and historical task shape across projects.

All Projects mode:

- Grouped lanes or sections, not kanban cards:
  - Blocked
  - Active
  - Planning/Drafting
  - Completed / pending closeout
  - Idle

Task row columns:

- Project
- Task title/id
- Phase
- Gate
- Current step
- Progress done/total
- Last updated
- Closeout signal

Selected Project mode:

- Current task summary panel.
- Plan checklist table:
  - Step id
  - Step title
  - Status
  - Dependencies
  - Acceptance short text
- Canonical/current status:
  - canonical task path exists
  - current alias synced
  - identity drift summary if available
- Closeout status:
  - check/review/journal required or done
  - pending-done signal if available

States:

- No active task.
- Current alias exists but canonical missing.
- Identity drift detected.
- Plan missing or malformed.

## 7. Gates View

Purpose: inspect quality gate status quickly and read raw evidence only when needed.

Top summary:

- Latest check status
- Check pass rate over recent N entries
- Latest review status
- Review errors/warnings/hints
- Install health
- Drift/identity drift indicator

Check history table:

- Timestamp
- Passed/failed
- Failed check names
- Duration if available
- Trigger/source if available

Review section:

- Summary first.
- Raw review markdown in bounded pre block.
- If review missing, show `No review evidence yet` rather than error styling.

Install/registry section:

- Install health passed/failed.
- Registry health: project count, stale count, unavailable count.
- Keep repair suggestions as text only; no command execution.

## 8. Events View

Purpose: provide a bounded message/event timeline.

Selected Project mode:

- Timeline table/list with latest 100 events by default.
- Columns/fields:
  - Time
  - Source: breadcrumb, check, review, session, runtime
  - Severity/status: info, pass, fail, warning, blocked
  - Task/step
  - Message

Filters:

- Source multi-select or segmented chips.
- Severity/status segmented chips.
- Search text.

All Projects mode:

- Per-project event summary, not full timeline.
- Columns: project, latest event time, latest failing/check event, active task, event count sampled.

Performance rule:

- Do not read unbounded breadcrumb history.
- API should accept a limit and return truncation metadata.
- UI must show `Showing latest N events` when truncated.

## 9. Component Inventory

Core components:

- `AppShell`
- `ProjectRail`
- `ProjectSearch`
- `ProjectStatusFilter`
- `ProjectRow`
- `RouteBand`
- `StatusBadge`
- `CommandPill`
- `MetricStrip`
- `AttentionQueue`
- `FilterBar`
- `DataTable`
- `DetailPanel`
- `Timeline`
- `HealthPanel`
- `EmptyState`
- `PartialDataBanner`
- `UnavailableProjectState`

Component rules:

- `StatusBadge` uses text + color, never color alone.
- `CommandPill` is display-first. Clipboard copy is optional and must not imply execution.
- `DataTable` supports horizontal density on desktop and stacked rows on mobile.
- `DetailPanel` is inline, not modal-first.
- `EmptyState` states should be concise and diagnostic, not instructional marketing copy.

## 10. State Matrix

| State | UI behavior |
| --- | --- |
| Loading registry | Shell skeleton, disabled project list, no fake data |
| Empty registry + valid cwd | Show `Local cwd` project and explain no registered projects in small muted copy |
| Current cwd not DocPath | Show diagnostic empty state; no mutation command button |
| Unknown root query | Error banner and fallback to local project if available |
| Deleted registered project | Keep row visible with `Unavailable`; detail view shows read error |
| Partial endpoint failure | Render available sections; show partial data banner with failed endpoint |
| No active task | Route band says no active task; backlog/events still available |
| Blocked task | Project row and route band use warning/failure badge; attention queue reason is first-class |
| Empty backlog | Empty backlog panel only, not whole-page empty state |
| No review evidence | Review summary unknown; not a failure state |
| Long event log | Latest N only with truncation notice |
| Mobile viewport | Rail stacks above content; filters wrap; row blocks replace wide tables |

## 11. Visual System

Palette:

- Background: neutral light gray.
- Surfaces: white and very light neutral.
- Sidebar: dark neutral, not purple/blue gradient.
- Success: green/teal.
- Warning: amber.
- Failure: red.
- Info: blue.
- Muted: slate gray.

Typography:

- System sans-serif.
- No viewport-scaled font sizes.
- No negative letter spacing.
- Compact headings: page h2 around 18-22px, panel h3 around 14-16px.
- Monospace only for commands, task ids where useful, paths.

Spacing:

- Dense but breathable: 8px base rhythm.
- Panel radius max 8px.
- Avoid nested cards. Use panels adjacent to tables, not cards inside cards.
- Stable row heights and fixed controls prevent layout shifting.

## 12. Interaction Details

Project selection:

- Single click switches selected project.
- Selected state persists in client state during session.
- If selected project becomes unavailable after refresh, keep it selected and show unavailable state rather than silently switching.

Refresh:

- Manual refresh button reloads projects and selected project data.
- No auto-refresh in MVP unless it is cheap and visually non-disruptive. If added later, make it explicit.

Filters:

- Filters are local client-side for loaded data in MVP.
- Filter state should be visible and resettable.
- Empty filtered results must distinguish from empty source data.

Detail panels:

- Selecting a backlog/task/event row opens detail panel.
- Detail panel can be closed, but selection should not navigate away from current route.

## 13. Open Design Decisions

1. Should All Projects be a persistent scope in the project selector, or only a mode inside Overview/Backlog/Tasks/Events?
   - Recommendation: use a persistent `All Projects` pseudo-project at top of the rail for summaries, while expensive detail panels require selecting a concrete project.

2. Should recommended command have a copy button?
   - Recommendation: yes, clipboard-only, with label `Copy`. It must not execute anything.

3. Should Events be a primary nav item or a panel inside Overview?
   - Recommendation: primary nav item. It is a core requested concept (`messages/events`) and will grow.

4. Should Backlog details use a drawer or inline split panel?
   - Recommendation: inline split panel on desktop, below-row expansion on mobile. Avoid modal interruption.

5. Should the visual style keep the current dark sidebar?
   - Recommendation: yes, but reduce decorative weight and increase project status density.

## 14. Approval Candidate

Approve this v2 direction if the intended MVP is:

- Multi-project first.
- Read-only by design.
- Dense operational dashboard.
- Overview + Backlog + Tasks + Gates + Events as primary navigation.
- No command execution, no write actions, no remote service.
