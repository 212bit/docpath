---
kind: visual-acceptance
status: draft
version: 1
required_sections:
  - Acceptance Scope
  - Must Pass
  - Must Not Regress
  - Review Evidence
  - Responsive Matrix
  - Accessibility Matrix
---

# Visual Acceptance

> Purpose: record executable visual验收 criteria after implementation.
> This file is the bridge from approved design intent to review evidence:
> screenshots, snapshot checks, HTML inspection, and reviewer notes.

## Acceptance Scope

- Approved design artifact:
- Implemented pages / views:
- Implemented components:
- Out of scope:

## Must Pass

> 写成可执行的必须项，review 时逐项对比实现和 design-preview.md。

- Layout:
- Dimensions:
- Spacing:
- Colors / tokens:
- Icons:
- Motion:
- Interaction states:
- Copy / readability:
- Navigation:

## Must Not Regress

> 写明不得出现的视觉、信息架构、交互或响应式退化。

- Must not:
- Forbidden visual directions:
- Disabled / loading / error state constraints:
- Destructive-action constraints:

## Review Evidence

| Evidence | Path / URL | Required check | Result |
|---|---|---|---|
| Desktop screenshot |  | screenshot review + design-preview 对比 | pending |
| Mobile screenshot |  | screenshot review + responsive 对比 | pending |
| Snapshot / DOM |  | snapshot 或 HTML 结构检查 | pending |
| Keyboard review |  | focus / navigation / aria-label 检查 | pending |

## Responsive Matrix

| Viewport | Must show | Must not show | Notes |
|---|---|---|---|
| 360px mobile |  |  |  |
| 768px tablet |  |  |  |
| 1280px desktop |  |  |  |

## Accessibility Matrix

| Area | Acceptance |
|---|---|
| Readability | Text remains 可读; contrast meets the design-preview target. |
| Focus | Keyboard focus is visible and follows the intended navigation order. |
| Semantics | Interactive controls have accessible names and valid HTML semantics. |
| Motion | Reduced-motion preference is respected where motion is non-essential. |
