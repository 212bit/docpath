# Visual Acceptance - Multi-project DocPath Dashboard

## Executable Visual Acceptance Criteria

The UI review must verify the following items before closeout:

- The dashboard must render a non-empty first viewport with project rail, primary navigation, top route band, and main content.
- The project rail must keep Overview, Backlog, Tasks, Gates, and Events navigation visible on desktop.
- The mobile layout must not reserve a full viewport-height sidebar before content; project list scrolling must be bounded.
- Overview must show multi-project metrics and an attention queue.
- Backlog must show filters and either an All Projects summary or selected project table/detail panel.
- Tasks must show cross-project grouping or selected project task summary.
- Gates must show check/review/install health summaries before raw review text.
- Events must show a bounded timeline or All Projects event summary.
- Text must remain readable without overlapping in desktop and mobile screenshots.
- The UI must visibly remain read-only and must not show Run/Fix/Apply mutation controls.

## Forbidden Visual Outcomes

- Must not use a marketing hero page.
- Must not hide primary navigation below a long project list on desktop.
- Must not display browser command execution controls.
- Must not load unbounded event logs in All Projects mode.
- Must not rely on color alone for state; text labels are required.

## Review Method

Review with Playwright snapshot and screenshot evidence:

- Desktop snapshot: 1440x900, Overview route.
- Desktop navigation check: Backlog and Tasks routes.
- Mobile snapshot: 390x844, Events route.
- Confirm the HTML accessibility snapshot exposes navigation, project selector, route band, and main content.
- Confirm screenshot output is nonblank and that navigation/content do not overlap.

## Verification Performed

Visual verification was performed with Playwright against the built dashboard served by `node dist/index.js dashboard --port 5179`.

- Desktop Overview route rendered with project rail, primary navigation, top route band, and main content.
- Backlog and Tasks routes loaded through primary navigation.
- Mobile Events route rendered with natural-height chrome and bounded project list.
- A desktop screenshot was captured during review; temporary local screenshot files were removed after inspection.

## Acceptance Result

Accepted for MVP implementation validation. Future iterations may refine density and add clipboard-only command copying, but this implementation satisfies the approved read-only multi-project dashboard direction.
