---
kind: design-approval
status: pending
version: 1
approval:
  state: pending
  source: null
  approved_at: null
  summary: null
  forbidden_directions: []
valid_states:
  - pending
  - approved
  - rejected
---

# Design Approval

> Purpose: prove that the user approved a concrete design direction, not merely the UI/UX process.

## Approval State

- State: pending
- Approval source:
- Approved at:
- Approved design artifact:
- Approval summary:

## Scope Of Approval

- Approved pages:
- Approved components:
- Approved responsive behavior:
- Approved visual tokens:
- Approved interaction model:

## Explicit Non-Approval

- The user agreeing to use this workflow is not approval of a concrete visual design.
- A generated Design Preview without user confirmation is not approval.
- A passing Visual Acceptance matrix without user confirmation is not approval.

## Forbidden Directions

- 

## Rejection Notes

- Rejected because:
- Required changes before resubmission:

## Implementation Release Condition

- Implementation may start only when frontmatter `approval.state` is `approved` and this document names the approved artifact or design direction.
