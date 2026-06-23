---
kind: ui-brief
status: draft
version: 3
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

# UI Blueprint - <Screen Name>

> Single UI design truth source. Every line must answer a developer/agent question at implementation time.
> Keep it: Screen Contract (3–5 lines) · Flow Contract (nav map + key paths) · Layout Contract (skeleton + sizes) · Component Contract (table) · State Contract (table) · Visual Contract (exact tokens) · Generation Contract (runnable prompts) · Acceptance Contract (checklist).
> Delete anything that only explains *why* a decision was made.

---

## 1. Screen Contract

- **Screen**: <name>
- **Target user**: <primary> / <secondary>
- **Entry point**: <command or URL>
- **Primary job**: <what the user needs to accomplish in ≤ 10 seconds>
- **Non-goals**: <what this screen deliberately does NOT do>

---

## 2. Flow Contract

### Navigation structure
```
<View A> (/<route>)          ← <purpose>
  └─ <Sub-view> (/<route>)   ← <purpose>
<View B> (/<route>)          ← <purpose>
```

### Key paths (2–3 sentences each)
- **<Path 1 name>**: <trigger> → <intermediate step> → <outcome>
- **<Path 2 name>**: <trigger> → <intermediate step> → <outcome>

---

## 3. Layout Contract

```
┌──────────────────────────────────────────────────┐
│  <Region A> (<width>px)  │  <Region B> (fluid)   │
│  [<element>]             │  [<Header> <Xpx>]     │
│  [<element>]             │  [<Content area>]     │
└──────────────────────────────────────────────────┘
```

- **<Region A>**: <purpose>, width <Xpx> expanded / <Xpx> collapsed
- **<Region B Header>**: height <Xpx>, sticky, contains <left elements> + <right elements>
- **<Region B Content>**: background <color>, padding <Xpx>, scrollable

---

## 4. Component Contract

| Component | Visual style | Hover / interaction |
| :--- | :--- | :--- |
| **Button** | <shape, color, size> | <translateY, shadow, etc.> |
| **Badge** | <shape, size, case> | static |
| **Card** | <radius, border, shadow> | <border deepen, shadow expand> |
| **<Other>** | | |

---

## 5. State Contract

| State | UI behavior | Copy / action |
| :--- | :--- | :--- |
| Loading | Skeleton placeholder, fade pulse | — |
| Empty | Icon + guidance text | `<example command or CTA>` |
| Error | Toast notification (top-right, auto-dismiss) | Retry button |
| Success | Green Snackbar, auto-dismiss | — |

---

## 6. Visual Contract

### Color tokens (exact hex)
- **Canvas**: `<#hex>` — <purpose>
- **Surface**: `<#hex>` — <purpose>
- **Border**: `<#hex>`
- **Text primary**: `<#hex>` — contrast <ratio> ✅
- **Text secondary**: `<#hex>` — contrast <ratio> ✅
- **Accent**: `<#hex>` — contrast <ratio> ✅
- **Accent hover**: `<#hex>`
- **Accent tint**: `<#hex>` — used for selected/hover backgrounds
- **Status**: Success `<#hex>` · Error `<#hex>` · Warning `<#hex>` · Info `<#hex>`

### Typography
- **Headings**: `<Font>` (serif/sans) — page titles, section titles
- **Body & controls**: `<Font>` (sans) — labels, buttons, body text
- **Code & commands**: `<Font>` (monospace) — paths, CLI output, inline code

### Spacing & shape
- **Base unit**: <X>px — spacing scale: ×2 ×3 ×4 ×6 ×8 ×12
- **Button border-radius**: <Xpx or 999px for pill>
- **Card border-radius**: <Xpx>
- **Hover lift**: `translateY(-2px)` + box-shadow

---

## 7. Generation Contract

### High-Fidelity UI Prompt
> Run this prompt in an AI image generator (DALL-E / Midjourney / Stitch / generate_image) to produce a reviewable mockup before implementation.

```text
Create a high-fidelity product UI mockup for: <Screen name>

Canvas:
- Width: <Xpx>
- Background: <#hex> (<tone description>)

Layout:
- <Region A> (<Xpx>, <#hex> background, <border description>):
  • <Element>: <description>
  • <Element>: <description>

- <Region B Header> (<Xpx>, sticky, <#hex>):
  • Left: <description>
  • Right: <description>

- Main Content (padding: <Xpx>, gap: <Xpx> vertical):
  1. <Panel name>:
     • <Element>: <description with exact colors>
  2. <Panel name>:
     • <Element>: <description>

Colors:
- Canvas: <#hex> · Surface: <#hex> · Border: <#hex>
- Text: <#hex> · Accent: <#hex> · Success: <#hex> · Error: <#hex>

Typography:
- Headings: <Font> · Body: <Font> · Code: <Font>

Style:
- <Component style, e.g. "Buttons: pill shape (999px radius), hover lift 2px">
- <Animation style, e.g. "All transitions: 200ms ease-out">

Avoid: laptop frames, marketing hero layouts, decorative blobs, lorem ipsum.
Output: production-ready dashboard UI, desktop width, realistic data.
```

### Wireframe Prompt
```text
Create a grayscale wireframe for: <Screen name>

Focus on layout regions (<X>px sidebar + <X>px header + scrollable content), component boundaries, typography hierarchy, and element sizing. No color. Use realistic labels instead of lorem ipsum.
```

---

## 8. Acceptance Contract

- [ ] Warm-toned background and accent color match Visual Contract tokens.
- [ ] Typography: headings use serif/designated font; code uses monospace.
- [ ] Attention/error items have prominent left border or visual signal.
- [ ] Active nav item is visually distinct (left border + background).
- [ ] All buttons, cards, and nav items have smooth hover/active transitions.
- [ ] Loading, empty, and error states are handled (not blank or raw spinner).
- [ ] No TypeScript compilation errors; CSS bundle within size limit.
- [ ] Text contrast meets WCAG AA (≥ 4.5:1) for all body and interactive text.
