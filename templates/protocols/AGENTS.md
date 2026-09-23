# DocPath Agent Protocol

> This project uses DocPath as the shared workflow engine for Codex, Claude Code,
> OpenCode, and compatible coding agents.
>
> Default rule: agents consume DocPath through CLI summaries. JSON/JSONL files are
> machine truth sources. Markdown files are rendered human views and are not
> default agent inputs.

## First Steps

1. Run `docpath next --agent` to read the `agent_view: next` route and the
   current workflow snapshot: `next_action`, `recommended_command`, required
   context, exit criteria, state, progress, drift, and install health.
2. Follow the `recommended_command` unless the user explicitly changes direction.
3. Use `context_index`, `data_index`, `required_files`, and `current_focus` as an
   index. Do not expand files just because they are mentioned.
4. Use `docpath status --agent` only when an explicit status/debug snapshot,
   drift check, or post-mutation confirmation is needed.
5. When details are needed, prefer `docpath reveal --topic <keyword> --level 1-3`
   or `docpath context --max-tokens 5000 --topic <keyword>`.
6. Record progress with DocPath lifecycle commands after each meaningful step.

## Access Model

DocPath is JSON-first internally and CLI-first for agents.

| Artifact | Role | Agent access |
| --- | --- | --- |
| `.docpath/workspace/state.json` | Runtime state truth | Use `docpath next --agent` for start/resume; use `docpath status --agent` for diagnostics. |
| `.docpath/workspace/current.md` | Human rendered state view | Do not read by default. |
| `.docpath/workspace/breadcrumb.jsonl` | Execution event truth | Use `next`, `status`, `reveal`, or `context`; direct tail only for debug. |
| `.docpath/workspace/breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `.docpath/tasks/current/spec.json` | Structured task spec truth | Prefer CLI summaries; direct read only when schema detail is needed. |
| `.docpath/tasks/current/spec.md` | Human spec view | Read on demand for full narrative requirements. `backlog promote` seeds spec.md with backlog background/FR/AC/evidence — edit the seed incrementally; reserve full `write-spec` rewrites for genuine resets. |
| `.docpath/tasks/current/plan.json` | Structured task plan truth | Prefer `next`, `go`, and `reveal`. |
| `.docpath/tasks/current/plan.md` | Human plan view | Do not parse manually by default. |
| `.docpath/docs-index.json` | Document index truth | Never read in full; use CLI filtered summaries. |

Direct file reads are acceptable only when the CLI route or the debugging task
requires them. Keep direct reads scoped to the smallest file, topic, task id, or
tail range that answers the question.

## Command Boundaries

- Prompt emitters such as `brainstorm`, `refine`, `analyze --dry-run`, and
  `plan --dry-run` output structured prompt contracts or payload previews for the
  current agent session. They do not call a hidden LLM and do not replace
  current-session reasoning.
- Artifact sinks such as `write-spec`, `write-plan`, `write-design`, and
  `write-analysis` persist content already generated or selected by the current
  agent session.
- Workflow gates such as `status`, `next`, `go`, `agent enter/step/done`,
  `check`, `review`, and `changes` are deterministic state, routing, validation,
  lifecycle, review, and closeout commands.
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. Agent owns semantic recovery decisions: whether
  a drifted spec is a new task, an old task restore, or a user-confirmed reset.
- If `next`, `status`, `check`, or `task drift` reports task identity drift, do
  not repair it with `agent step`; choose a restore/reset/capture/promote path
  with explicit user intent.
- `docpath next --agent` is a read-only advisory router for session
  start/resume and uncertain state. It does not grant permission, hold locks, or
  replace command preflight gates. Do not require it before an explicit
  deterministic user command such as `go --step`, `check`, `review`, or
  `changes`.
- State-changing commands such as `go`, `agent enter/step/done`, `plan`,
  `check`, `review`, `journal`, and `backlog promote` must re-read workflow
  state and enforce their own preconditions.
- `docpath go --step <id>` is atomic step control: it claims/starts the selected
  step only if the workflow allows that step now.
- Treat `--dry-run` output as preview material only, not as durable final
  analysis/spec/plan evidence.

## Project Context

- `.docpath/backlog/` holds candidate work before it becomes an active task.
- `.docpath/tasks/` holds task artifacts: spec, plan, review, journal, and
  structured JSON mirrors.
- `.docpath/workspace/` holds runtime state, evidence, and rendered views.
- `.docpath/rules/` holds global style, architecture, and learned conventions.
- `.docpath/protocols/` and `templates/` hold installable agent protocol assets.

## Agent Lifecycle Commands

Use lifecycle commands instead of manual state edits:

<!-- docpath:block lifecycle-commands -->
```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath go --step S1
docpath step-pass                  # compound (R-340): finish current step + auto-start next
docpath agent step --step "S1" --status done
docpath check                      # targeted quality check during iteration
docpath done                       # compound: full gate sequence (check -> review -> journal) in one shot
docpath quick-done                 # compound (R-340): done gate sequence + commit-readiness in one call
```
<!-- /docpath:block -->

### Lightweighting & Token Economy Rules (轻量化与 Token 预算准则)

To avoid heavy ceremony, unnecessary round-trip latency, and context window bloat:

1. **Mandatory Workflow Tiering (强制分级，严禁越级大炮打蚊子)**:
   - **Ultra-light / Quick Fixes (Estimated diff < 50 lines, single config, docs typo, localized bugfix)**:
     **MUST** use `docpath quick "<title>"`. Bypasses backlog promotion, spec, and plan ceremonies; directly claims execution; preserves quality baseline with `check` on closeout. Reduces CLI round-trips by 70%.
     - *Post-hoc adoption (事后补录)*: If code edits were already made before starting the task, use `docpath quick "<title>" --adopt` to claim existing uncommitted changes directly into the quick task without resetting the worktree.
   - **Small/Medium Tasks (Estimated diff < 100 lines, single module, no contract/architecture changes)**:
     **MUST** use `--level 1` (e.g. `docpath backlog add --level 1` or `init --level 1`). Prunes redundant formal review and heavy journal ceremonies.
   - **Architecture / Cross-module / Breaking Changes**:
     Only escalate to `level 2` / Standard Profile when scope touches core architecture, multi-module contracts, protocol changes, permissions, or migrations.

2. **Atomic Execution & Incremental Gates (减少往返与门禁等待)**:
   - **Atomic Step Claim**: Use `docpath go --step <id>` directly to claim and start the step in one shot. Avoid extra round-trips with redundant `agent enter` declarations unless multi-session tracking is explicitly required.
   - **Incremental Verification During Coding**: During iterative development and debugging, avoid running full-suite `docpath check` in loops. Run targeted tests or fast validation; run the full `docpath check` suite once before `agent done`.

3. **Strict Context Budget & Anti-bloat (严格控制上下文消耗)**:
   - **NEVER** read full human-rendered Markdown files (`current.md`, `breadcrumb.md`, `plan.md`, `spec.md`, `docs-index.json`).
   - Always consume compact machine routes (`docpath next --agent`, `docpath status --agent`).
   - When retrieving topic details, strictly use token-budgeted commands:
     - `docpath reveal --topic <keyword> --level 1`
     - `docpath context --smart --max-tokens 2000` (prefer smart rule/doc routing over manual search)
     - `docpath context --max-tokens 2000 --topic <keyword>`
   - When context token usage is heavy or sessions run long, run `docpath budget --agent` or `docpath budget --suggest` to analyze token distribution, and use `docpath budget --prune` to slim down context.

4. **Failure Handling & Verification Dedup (失败处理与验证去重)**:
   - **Environment-level failures stop after two attempts**: when a tool call is refused by the harness itself (permission denied, sandbox/classifier unavailable, command blocked) rather than by the command's own output, retry at most once. On the second failure, stop, report the exact error and what remains undone, and let the user decide. Re-sending an identical large payload ten times costs more than the task it was meant to finish.
   - **Do not re-run what the gate already ran**: `docpath check` and `docpath done` execute typecheck / test / build and print the commands they ran. Do not run those by hand immediately before or after the gate "to be sure"; run targeted checks during iteration, then let the gate be the single full run.
   - **Edit with the editor tool, not with scripts**: prefer the harness's file-edit tool over `sed` / heredoc / python rewrites. Script edits make the harness re-inject the whole changed file into context on the next turn; a targeted edit does not. Fall back to scripts only for mechanical multi-site renames the editor cannot express.

### Lifecycle Rules

- Run `docpath go --step <id>` to claim the active step before code or protocol edits; `docpath agent enter` is an optional session declaration and is legal only after the step is executing.
- Run `docpath agent step` after each meaningful sub-task or major decision.
- Run `docpath verify` to confirm requirement completeness and scope boundaries before final closeout.
- Run `docpath done` (or `docpath quick-done`) before claiming a task is complete.

## Git Convention

- **Auto-commit after `agent done`**: Once `docpath agent done` completes and
  all gates pass (check, review, journal), commit automatically. Do not commit
  mid-task on intermediate verification passes.
- **Run `docpath changes --agent` before each commit**: Treat it as the commit
  readiness report. Use its closeout summary as the commit message title;
  append sub-change bullet points in the body.
- **Stage all modified tracked files**: Include both source/test files and any
  tracked `.docpath/` files (backlog, rules, AGENTS.md) that changed during the
  work. The `.gitignore` already excludes pure runtime state (workspace/,
  tasks/current/) — there's no risk of staging transient data.
- **Atomic by logical unit**: One commit per coherent change. If a change spans
  multiple independent concerns (e.g., fix + refactor in different modules),
  split into separate commits.
- **Do not push**: Commits are local. Pushing requires explicit user request.

## Required Gates

1. Do not skip `docpath next --agent` at start/resume or when state is
   uncertain. Do not require it before an explicit deterministic user command;
   that command must enforce its own gate. Use `docpath status --agent` only for
   explicit status/debug snapshots, suspected drift, or confirmation after
   state-changing commands.
2. Do not act from memory alone.
3. For trivial low-risk edits, prefer `docpath quick "<title>"` over a full
   backlog/spec/plan cycle. Do not use quick as a bypass for architecture,
   workflow, permission, migration, CI/CD, or broad module changes.
4. When a product/UI request lacks target user, entry point, data scope, or
   interaction model, clarify or run brainstorm/refine before implementation.
5. When a request may change technology stack, architecture or module
   boundaries, data/API contracts, UI information architecture, workflow or
   agent behavior, permission or write boundaries, task scope, existing
   capabilities, or long-term maintenance cost, run brainstorm/refine first.
   Record a Decision Brief in the task spec and wait for explicit user
   confirmation before implementation.
6. Do not hand-edit `state.json`, `current.md`, `breadcrumb.md`, or other
   workspace runtime views.
7. Run `docpath check` before marking work complete.
8. Let `docpath agent step` update breadcrumb and plan checklist state.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `docpath next --agent` | Default agent start/resume route with command contract and compact state snapshot |
| `docpath status --agent` | Diagnostic workflow state snapshot and health indexes |
| `docpath reveal --level N --topic <keyword>` | Progressive context expansion |
| `docpath context --smart` | Smart path- and topic-affine rule & document routing package (`--agent` / `--raw`) |
| `docpath context --max-tokens 5000 --topic <keyword>` | Budgeted context package |
| `docpath go --step S1` | Atomically claim/start the selected plan step |
| `docpath check` | Quality gates |
| `docpath verify` | Semantic anti-drift, scope boundaries, and requirement completeness gate (`--agent` / `--json`) |
| `docpath review` | Structured review |
| `docpath quick-done` | Compound closeout with optional `--gotcha <text>` capture |
| `docpath learn` | Promote validated lessons into durable rules (`--agent` / `--dry-run`) |
| `docpath milestone` | Aggregate completed tasks and generate release summaries (`--dry-run` / `--agent`) |
| `docpath budget` | Analyze context token consumption breakdown & pruning suggestions (`--agent` / `--suggest` / `--prune`) |
| `docpath docs doctor` / `fix` | Living documentation diagnostics & automatic self-healing (broken links, unindexed files) |
| `docpath docs search <topic>` | Fast topic search across living project documentation |
| `docpath docs lint` | Living documentation integrity check (broken links & unindexed files) |
| `docpath worktree matrix` | Live progress matrix across concurrent agents and worktrees (`--agent` / `--json`) |
| `docpath worktree broadcast <msg>` | Broadcast breaking changes/announcements to all active worktrees |
| `docpath journal` | Knowledge archive |
| `docpath gc` | Preview workspace cleanup candidates and inactive task archive candidates; `--force` executes |

## Worktree Concurrent Development

DocPath supports true concurrent development via Git Worktrees. Use when multiple
agents need to develop different features simultaneously without conflicts.

### When to Use Worktrees

Use `docpath worktree create <name>` when:
- User explicitly requests concurrent development
- Developing Feature A while another agent/session develops Feature B
- Need complete isolation (separate workspace/, tasks/, state)

Do NOT use worktrees for:
- Single-agent sequential development (use normal workflow)
- Quick testing or verification (use session isolation with DOCPATH_SESSION)

### Worktree Workflow

```bash
# Create worktree for Feature A
docpath worktree create feature-a
cd .worktrees/feature-a

# Set session ID (optional but recommended)
export DOCPATH_SESSION=codex

# Standard DocPath workflow
docpath backlog promote R-xxx
docpath plan
docpath go --step S1
# ... develop ...
docpath agent step --step S1 --status done
docpath check
git commit

# Merge back to main
cd ../../
git merge feature-a
docpath worktree remove feature-a
```

### Multi-Agent Collaboration & Matrix

When multiple agents operate across parallel worktrees:
- Run `docpath worktree matrix` (or `docpath worktree matrix --agent`) to inspect active agents (`session`), assigned tasks, current step progress, and dirty file status across all branches.
- When introducing breaking architectural changes, schema migrations, or shared contract updates, run `docpath worktree broadcast "<announcement>"` to dispatch high-priority notifications to all other worktrees' event streams.

### Worktree Isolation

<!-- docpath:block worktree-isolation -->
Resources are split by sharing model (R-238 Option B, reaffirmed by R-273 —
do NOT symlink tracked directories: git records the swap as mass deletion and
merging it back deletes main's files):

**Merge-mediated** (tracked copy — shared via branch merges, not live):
- `.docpath/backlog/` - requirement pool; tracked in main, each worktree gets a
  snapshot copy. Snapshots can go stale (known limitation; merge reconciles).
  Backlog id allocation is single-pool at the CLI layer: `capture`/`add` inside
  a worktree also scans the main checkout's backlog to avoid id collisions.
- `.docpath/rules/` - rules; tracked, each worktree gets a snapshot, reconciled on merge
- `.docpath/tasks/done/` - completed-task archives; tracked, reconciled on merge

**Isolated** (independent per worktree — gitignored runtime):
- `.docpath/workspace/` - each worktree has its own state.json
- `.docpath/tasks/current/` - each worktree has its own active task runtime
- `.docpath/journal/` - independent archives

**Result**: Each worktree runs as an independent DocPath workspace; backlog,
rules, and completed tasks reconcile at merge. `docpath worktree doctor`
reports each resource against its expected model (merge-mediated / isolated)
and fails a symlinked backlog over tracked files (repair with
`docpath worktree repair`).
<!-- /docpath:block -->

### Commands

- `docpath worktree matrix` - view live collaboration matrix across all agents/worktrees (`--agent` / `--json`)
- `docpath worktree broadcast <msg>` - broadcast notification across all active worktrees
- `docpath worktree list` - list all worktrees
- `docpath worktree create <name>` - create new worktree
- `docpath worktree remove <name>` - delete worktree

See `docs/features/worktree-workflow.md` for detailed usage guide.

## Decision Log Aging

- `workspace/decisions.md` keeps recent ADR entries only.
- `docpath journal` rotates older entries into `workspace/decisions-YYYY-MM.md`.
- Historical decision queries should read the relevant monthly archive
  explicitly, not the full decision history.
- `docpath journal` should write decisions only for reusable architecture,
  workflow, or behavior decisions with context, impact, boundaries, and
  alternatives.

## Linked Project

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
