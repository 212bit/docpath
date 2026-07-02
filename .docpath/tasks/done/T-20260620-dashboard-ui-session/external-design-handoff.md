---
kind: external-design-handoff
status: draft
version: 1
supported_tools:
  - Stitch
  - Figma
  - v0
  - Framer
  - other
required_sections:
  - Tool Inputs
  - Tool Outputs
  - Selected Direction
  - Rejected Directions
  - Implementation Constraints
---

# External Design Handoff

> Purpose: record the prompt and artifacts used to create a reviewable design direction outside DocPath.

## Tool Inputs

- Tool: v0
- Prompt: "Create a React-based log modal that overlay-covers a developer dashboard. It should stream CLI outputs, show loading/success/failed states, and have a close button."
- Source brief: ui-brief.md
- Reference assets: None
- Constraints passed to tool: Vanilla CSS only, responsive layout, dark/light theme compatibility.

## Tool Outputs

| Artifact | Link / path | Snapshot / notes | Status |
|---|---|---|---|
| Modal Layout | src/dashboard-ui/src/main.tsx | Contains log output modal | candidate |

## Selected Direction

- Selected artifact: Centralized CommandModal React component in `main.tsx`
- Why this direction: Having a single modal managed in AppShell avoids duplicated state across pages and ensures consistent backdrop overlay rendering.
- What to preserve during implementation: Monospace font for logs, loading indicator, exit status check.
- Open issues before approval: Real-time chunk parsing.

## Rejected Directions

| Artifact | Reason rejected | Do not reuse |
|---|---|---|
| Inline inline alert logs | Too distracting and breaks the row heights in tables | Yes |

## Implementation Constraints

- Layout constraints: Modal max-width 640px, max-height 80vh, scrollable log container.
- Component constraints: Uses standard native fetch APIs to handle streamed response body.
- Token constraints: Colors inherit from CSS vars defined in styles.css.
- Responsive constraints: Table actions wrap cleanly or stack on viewports < 640px.
- Accessibility constraints: ESC key hook for closing the modal, proper tab index.
- Data / state constraints: Automatically refetch active data after command completes.
