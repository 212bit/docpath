---
kind: ui-prompt-brief
status: draft
version: 1
required_sections:
  - Product Context
  - Design North Star
  - Visual Direction
  - Anti-goals
  - Design Tokens
  - Shared Components
  - Page Matrix
  - P0 Page Brief
page_priorities:
  - P0
  - P1
  - Later
---

# UI Prompt Brief

> Purpose: create a concrete, reviewable prompt brief before UI implementation or external design handoff.

## Product Context

- Product / surface: DocPath Developer Dashboard
- Target user: Coding Agents and developers utilizing DocPath workflow engine
- User job: Reviewing and executing task step lifecycles, terminating active agent sessions, and releasing lease locks
- Entry point: WorkboardPage and WorktreesPage
- Business or workflow context: Ensures transparency in command execution log and provides direct interactive controls to manage step status
- Read/write boundary: Interactive writes (POST to run commands, DELETE for sessions/leases)

## Design North Star

- Desired feeling: Professional, reliable, clean, developer-focused
- Primary UX outcome: Developers can trigger steps and terminate leases with real-time feedback and clear stdout/stderr execution log
- What users should understand in the first 5 seconds: How to claim/complete steps, how to see which worktrees/sessions are active, and how to terminate them
- Quality bar: Zero UI layout shift during modal rendering; precise alignment of inline buttons

## Visual Direction

- Layout direction: Clean grid layout; actions placed inline next to their targets
- Information density: Moderate-high density to showcase logs and session states
- Color / contrast direction: Accent/Harmonious palette with clearly differentiated state colors (green for success, red for danger/terminate, blue/indigo for primary)
- Typography direction: System sans-serif / monospace for CLI stdout logs
- Motion / transition direction: Base 200ms transition for modal backdrop fade-in and scale
- Reference products or screenshots: GitHub actions log, Vercel deployment logs

## Anti-goals

- Do not build: Full command editor; this is a control dashboard, not a terminal emulator.
- Do not visually imply: Persistent SSH connection; it runs atomic shell commands.
- Avoid these patterns: Destructive actions without visible warning or explicit button coloring (e.g., Terminate must be red).

## Design Tokens

| Token | Direction | Notes |
|---|---|---|
| Color | Slate/Zinc base; Indigo primary | Modern tech look |
| Typography | Inter/System sans-serif | Monospace for logs |
| Spacing | 8px / 16px padding rules | Standard grid spacing |
| Radius | 6px / 8px rounded corners | Soft corners |
| Elevation | Subtle shadow for modal | Elevate above backdrop |
| State colors | Success: Green; Warn: Amber; Error: Red | clear visual mapping |

## Shared Components

| Component | Role | States | Notes |
|---|---|---|---|
| Button | Action trigger | Idle / hover / active / disabled / loading | Inline or block options |
| CommandModal | Log output display | Open / executing / success / failed / closed | overlay with backdrop |

## Page Matrix

| Priority | Page / View | User goal | First-screen responsibility | Approval required? |
|---|---|---|---|---|
| P0 | Workboard Page | Claim/Done/Block/Skip steps | Display steps with inline control buttons | yes |
| P0 | Worktrees Page | Terminate sessions & release leases | List active leases/sessions with terminate triggers | yes |
| P0 | Command Modal | View CLI output in real-time | Auto-scrolling output log and exit status | yes |

## P0 Page Brief

### Page Goal

- Allow developers to manage DocPath tasks, steps, sessions, and leases directly from the web interface.

### Primary User Questions

- How do I claim the next step in my plan?
- Where can I see if the step action succeeded or failed?
- How do I force release a lease locked by a crashed agent?

### First Screen Layout

- Header: Navigation bar (Overview, Workboard, Worktrees, Backlog, Events, Gates)
- Primary content:
  - Workboard: List of plan steps with their current markers and inline actions.
  - Worktrees: Active workspaces list, active sessions table, lease locks table.
- Persistent controls: Button triggers for API requests.
- Responsive collapse: Collapses sidebar and shifts inline buttons to block level on small viewports.

### Main Components

| Component | Responsibility | Required states |
|---|---|---|
| StepRow | Display plan step and action buttons | Pending / Current / Done / Blocked / Skipped |
| SessionRow | Display session information and Terminate button | Active / Terminated |
| LeaseRow | Display lease and Release button | Locked / Released |

### Interaction

- Primary action: Claiming or completing a step; Terminating a session; Releasing a lease.
- Secondary actions: Close command modal.
- Navigation: Header links to switch views.
- Keyboard / focus behavior: ESC key closes CommandModal. Focus ring on buttons.
- Confirmation points: Double confirm or distinct style/color (Red) for destructive actions (Release, Terminate).

### Visual Acceptance

- Must show: Inline buttons in tables; centered command execution modal with real-time log streaming.
- Must not show: Overflowing text or overlapping button texts.
- Desktop acceptance: Flat layout, table rows perfectly aligned.
- Mobile acceptance: Rows stack vertically; buttons occupy full width of item.
- Accessibility acceptance: Contrast ratio >= 4.5:1, keyboard ESC handles close.
