# R-237 Analysis — Elevate /learn priority in status when pending lessons and regression warnings exist

## Problem

`docpath next --agent` / `status --agent` already compute `lesson_summary.pending_count`, and completed-phase status detail can mention pending lessons. But in `inferNextAction` (src/utils/agent-output/formatters.ts), the completed/idle route order is:

1. dirty worktree / ignored closeout evidence → `docpath changes --agent`
2. accepted executable backlog → `backlog promote`
3. immature accepted backlog → `backlog edit`
4. proposed backlog (including raw items) → brainstorm / accept
5. **only then** pending lesson candidates → `docpath learn --dry-run`
6. gc / backlog capture

Observed failure mode (this workspace, 2026-07-10):

- state/phase: `completed` / `review_pass`
- `lesson_summary.pending_count: 10`
- install health failed (`install-manifest-drift` — a regression/health warning)
- `next_action` still routes to analyzing proposed raw backlog (R-237 itself) instead of `docpath learn --dry-run`

So agents keep spawning new backlog shaping while high-value journal lessons remain unconsolidated. That inverts the intended post-task knowledge closeout loop: journal → learn → then new work.

## Root Cause

Learn is treated as a last-resort idle filler, not as a closeout peer of git changes. Proposed/raw backlog always outranks pending lessons, even when:

- actionable (non-low-value) lesson candidates remain, and
- status already surfaces health/regression-style warnings (`install_health`, check history regressions, etc.)

Low-value workflow lesson blocks are already filtered by `isLowValueWorkflowLessonBlock` / `summarizeUnlearnedLessonCandidates`; the bug is routing priority, not candidate counting.

## Expected Behavior

When the workflow is idle or completed (no active execution obligation), and there are **actionable pending lesson candidates**, elevate `/learn` in agent routing so agents consolidate knowledge before opening more proposed backlog work.

### Priority rules (completed / idle only)

| Priority | Condition | Route |
| --- | --- | --- |
| P0 | Dirty worktree or canonical ignored closeout evidence | `docpath changes --agent` |
| P1 | Accepted **executable** backlog | `docpath backlog promote <id>` |
| P2 | Actionable pending lesson candidates **and** a regression/health warning signal is present | `docpath learn --dry-run` (elevated) |
| P3 | Actionable pending lesson candidates (no regression warning) | still prefer `docpath learn --dry-run` over proposed/raw backlog shaping |
| P4 | Immature accepted / proposed backlog shaping | brainstorm / edit / accept |
| P5 | gc / capture fallbacks | unchanged |

**Regression/health warning signals** (any one is enough for elevated messaging; count still uses existing lesson summary):

- `install_health.passed === false` or `install_health.errors/warnings > 0`
- check regression history indicates reopened/failed checks for the current or recent task when that signal is already available to the status/next builder
- other existing status warnings that already mean “system is not healthy / knowledge may be stale”

If only lessons exist (no warning), learn still outranks **proposed raw/shaped backlog**, so agents do not pile analysis work while lessons rot. Accepted executable promote remains above learn so committed work is not starved.

### Status surface

- Keep compact `lesson_summary.pending_count` on `status --agent` / `next --agent`.
- When elevated learn applies, `next_action` / `recommended_command` must be learn, not proposed backlog.
- Optionally strengthen completed-phase status detail to mention both pending lessons and the warning class that triggered elevation (install / check regression). No new human dashboard scope required for MVP.

## Scope

### In scope

- Reorder `inferNextAction` completed + idle branches for learn vs proposed/immature backlog.
- Wire regression/health warning detection from signals already available to the status/next context builder (prefer install health + any existing regression/check warning fields; avoid new network/LLM deps).
- Regression tests in `tests/next.test.mjs` (or equivalent):
  1. completed + pending actionable lessons + proposed raw backlog → learn (not brainstorm/accept)
  2. completed + pending lessons + install_health fail → learn elevated
  3. completed + pending lessons + accepted executable backlog → still promote accepted
  4. completed + only low-value lessons + proposed backlog → existing low-value filter behavior; do not force learn
  5. dirty worktree still beats learn

### Out of scope

- Auto-running `docpath learn` without dry-run preview
- Changing learn merge semantics, lesson key dedupe, or style/architecture write rules
- Dashboard UI redesign
- Forcing learn during active `executing` / `checking` / `reviewing` phases
- Redesigning install doctor itself (only consume its status signal)

## Technical Surface

- Primary: `src/utils/agent-output/formatters.ts` (`inferNextAction`, completed/idle order)
- Possibly: status context assembly that already builds `install_health` / lesson summary so warning flags can be passed into `inferNextAction`
- Tests: `tests/next.test.mjs` (existing learn-before-backlog-capture cases become the template)
- No protocol file rewrite required for MVP if CLI route output alone changes agent behavior

## Decision Brief (for later promote; L2)

- **Problem**: Post-completion routing prefers proposed backlog over consolidating pending lessons, even with health/regression warnings.
- **Options**:
  - A: Always put learn above all backlog (including accepted) when lessons pending
  - B: Put learn above proposed/raw shaping and immature accepted, but below dirty closeout and accepted executable promote; further elevate messaging when health/regression warnings exist **(recommended)**
  - C: Only elevate learn when both lessons and warnings exist; otherwise keep current order
- **Chosen (recommended)**: B — protects knowledge closeout without starving ready accepted work or git safety.
- **Why not A**: Ready accepted work should still be promote-able after closeout.
- **Why not C only**: Current production pain is lessons losing to raw proposed backlog even without a second signal; C alone would under-fix the observed bug.
- **Risk**: Agents may pause new backlog shaping until learn is dry-run/applied; mitigate with existing low-value lesson filter and dry-run first.
- **Rollback**: Restore previous branch order in `inferNextAction`.

## Acceptance Criteria

- [ ] AC-1: With `phase=completed`, actionable pending lessons, and a proposed raw backlog item, `next --agent` recommends `docpath learn --dry-run` (not brainstorm/accept of the proposed item).
- [ ] AC-2: With the same setup plus install health failure (or equivalent regression/health warning), learn remains the recommended route and next_action mentions pending lessons.
- [ ] AC-3: Accepted executable backlog still outranks learn when present (after dirty closeout).
- [ ] AC-4: Dirty worktree / ignored closeout evidence still outranks learn.
- [ ] AC-5: Low-value-only lesson candidates do not force learn (existing filter preserved).
- [ ] AC-6: Focused regression tests cover AC-1..AC-5; no network/LLM dependency.

## Evidence References

- Live route 2026-07-10: completed + 10 pending lessons + install-manifest-drift → next recommended brainstorm on R-237
- Implementation locus: `inferNextAction` completed/idle order in `src/utils/agent-output/formatters.ts`
- Existing tests: `tests/next.test.mjs` learn-before-capture cases (no proposed-backlog competition case yet)
