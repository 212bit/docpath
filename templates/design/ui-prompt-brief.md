---
kind: ui-brief
status: draft
version: 2
purpose: canonical-ui-design-source
required_sections:
  - Screen Contract
  - Flow Contract
  - Layout Contract
  - Component Contract
  - State Contract
  - Visual Contract
  - Generation Contract
  - Acceptance Contract
---

# UI Blueprint

> Purpose: one high-density UI source for design review, high-fidelity image generation, wireframes, implementation, and visual review.
> Keep design decisions here. `design-approval.md` records only approval state; `visual-acceptance.md` records only post-implementation evidence.

## 1. Screen Contract

- Screen:
- Product area:
- Target user:
- Entry point:
- Primary job:
- Success outcome:
- Non-goals:

## 2. Flow Contract

- Before this screen:
- Main path:
- Secondary paths:
- Exit paths:
- Risky or destructive actions:
- Confirmation points:
- Read/write boundary:
- Permission visibility:

## 3. Layout Contract

- Viewport targets:
- Regions:
- Navigation:
- Primary content:
- Secondary content:
- Toolbar/actions:
- Detail panels:
- Status/feedback placement:
- Information priority:
- Data density:
- Long text behavior:
- Overflow behavior:

## 4. Component Contract

| Component | Purpose | Data | States | Actions | Notes |
|---|---|---|---|---|---|
|  |  |  | loading / empty / error / disabled / active / success |  |  |

## 5. State Contract

| State | Trigger | UI behavior | Copy | Action |
|---|---|---|---|---|
| Loading |  |  |  |  |
| Empty |  |  |  |  |
| Error |  |  |  |  |
| Partial data |  |  |  |  |
| Permission denied |  |  |  |  |
| Disabled |  |  |  |  |
| Success |  |  |  |  |
| Destructive confirmation |  |  |  |  |

## 6. Visual Contract

- Overall direction:
- Layout grid:
- Stable dimensions:
- Spacing scale:
- Typography:
- Color tokens:
- Icon system:
- Borders/radius:
- Shadows/elevation:
- Motion:
- Responsive behavior:
- Accessibility:
- Technical constraints:

## 7. Generation Contract

### High-Fidelity UI Prompt

Create a high-fidelity product UI mockup for:

- Screen:
- Audience:
- Goal:
- Layout:
- Visual style:
- Content:
- Interaction cues:
- Responsive constraints:
- Accessibility constraints:
- Output: polished product UI screenshot, not a landing page or concept poster.

### Wireframe Prompt

Create a grayscale wireframe for:

- Screen:
- Focus on information hierarchy, page regions, component placement, primary and secondary actions, state areas, and responsive behavior.
- Avoid color styling, decorative visuals, marketing layout, and placeholder lorem ipsum.

### Negative Prompt

Avoid:

- Marketing hero layouts
- Decorative cards without workflow purpose
- Nested cards
- Decorative orbs, bokeh, or abstract gradient blobs
- Text overflow
- Incoherent overlap
- Unclear primary action
- Unconfirmed destructive actions

## 8. Acceptance Contract

- [ ] Primary path is visible in the first viewport.
- [ ] Main action is visually dominant and secondary actions are clear.
- [ ] Dangerous action is separated and confirmed.
- [ ] Loading, empty, error, permission, and disabled states are represented.
- [ ] Desktop layout has no overlap or horizontal overflow.
- [ ] Mobile layout remains readable or has an explicit degradation strategy.
- [ ] Text does not overflow buttons, cards, tables, panels, or controls.
- [ ] Keyboard/focus order and accessible names are defined for interactive controls.
- [ ] Implementation can be derived without inventing missing layout, state, or visual rules.
