# DocPath Agent Protocol

> Shared workflow engine for Codex, Claude Code, OpenCode, and Antigravity.
> **Rule**: Consume DocPath through CLI summaries. JSON/JSONL are machine truth; Markdown files are rendered human views and never default agent inputs.

## First Steps & Access Model

1. **Start / Resume**: `docpath next --agent` is the read-only advisory router. Inspect `next_action`, `recommended_command`, required context, and exit criteria. **Do not re-run `next --agent` after every command (R-460)**: most lifecycle commands already emit a trailing `next_hint` (`next_action` / `recommended_command` / `exit_criteria`) — trust it and execute it directly, collapsing the per-step loop from 2 round-trips to 1. Only re-run `next --agent` on branching, ambiguity, session resume, when trailing `next_hint` is missing/untrustworthy, or when pointing to an investigation/repair path requiring re-route.
2. **Access Model**:
   - Runtime state: `.docpath/workspace/state.json` (Read via `next --agent` or `status --agent`)
   - Task spec/plan: `.docpath/tasks/current/spec.json`, `plan.json` (Read via `next`, `go`, `reveal`)
   - Progress events: `.docpath/workspace/breadcrumb.jsonl` (Read via `next`, `status`, `reveal`)
   - Human rendered views (`current.md`, `breadcrumb.md`, `spec.md`, `plan.md`, `docs-index.json`): **Do not read by default**.
   - When detailed context is needed, use `docpath reveal --topic <kw> --level 1` or `docpath context --smart --max-tokens 2000`.

## Agent Lifecycle Commands

<!-- docpath:block lifecycle-commands -->
```bash
# Core 3+1 Loop (Daily High-Frequency Workflow):
docpath quick "Fix typo in docs"   # Ultra-light: < 50 lines 1-shot fast path (post-hoc: --adopt)
docpath start "<title>" --draft    # Setup: 1-shot task bootstrapping (promote + plan + go S1)
docpath go --step S1               # Progress: atomically claim or switch to a plan step
docpath step-pass --commit         # Step closeout: finish step + auto-commit final gate (or relay next)
docpath done --commit              # Compound closeout: 1-shot full gate sequence (check -> review -> journal -> commit)

# Advanced / Transitions (Coordination & Maintenance):
docpath step-skip S2 --reason ".." # Skip or supersede step with breadcrumb evidence
docpath task stash "WIP msg"       # Stash active task state and dirty changes (pop / switch)
docpath arch check                 # Architecture boundary & anti-corruption check
docpath gc                         # Workspace historical task cleanup
```
<!-- /docpath:block -->

### Lightweighting & Execution Guardrails

1. **Mandatory Tiering**:
   - **Ultra-light (< 50 lines diff, typo, single config, localized fix)**: **MUST** use `docpath quick "<title>"`. (Post-hoc: `--adopt`; upgrade: `docpath quick upgrade`).
   - **Strict Redlines for `quick`**: Any modification touching schedulers (`agent.ts`, `check.ts`, `done.ts`, `runtime.ts`), core engines (`src/engine/**`), protocol assets, or expecting > 50 lines diff **MUST NEVER** use `quick`; start with `docpath start "<title>" --draft`.
   - **Small/Medium (< 100 lines)**: Use `--level 1` (skips formal review and lengthy journal).
   - **Architecture / Cross-module**: Use `--level 2` (Standard Profile).

2. **Atomic Execution & Zero-Redundancy Gates**:
   - **Atomic Step Claim**: `docpath go --step <id>` is atomic step control to claim and start steps in 1-shot.
   - **Strictly Prohibit Full Tests & Redundant Builds in Dev Loop**: During iterative development and single-case debugging, **ONLY** run single-file targeted tests (e.g., `node --test tests/<file>.test.mjs`, `go test -run`, `pytest`). The step verification engine has built-in **build-aware self-healing** (automatically builds incrementally when source is newer than dist — no manual `npm run build` needed). **Full test suites run EXACTLY ONCE**, triggered atomically by `docpath done --commit` or `docpath step-pass --commit` at the final closeout gate (check → review → journal → git commit). Never manually run `docpath check` or full test suites (`npm test`) before or after closeout.
   - **Never Hand-Edit AC Checkboxes**: `AC-*` acceptance criteria in `spec.md` are static requirement assertions. Never write scripts or manually edit them to `[x]`; progress is driven strictly by `plan.md` and `docpath step-pass` (or `docpath agent step --step <id> --status done`).
   - **Edit with Tools, Not Scripts**: Prefer editor tools over shell scripts (`sed`, heredocs) to minimize context re-injection.
   - **Failure Handling**: Stop after 2 consecutive environment/harness failures and report.

3. **Strict Context Budget & Anti-Bloat**:
   - **Trust Trailing `next_hint` (R-460)**: `go`, `step-pass`, `check`, `done`, `plan`, `review`, and `journal` end with a concrete `recommended_command`. Execute it directly instead of re-running `docpath next --agent`. The engine automatically guards against self-loop fallbacks (any recommendation that would re-invoke `next` is replaced with the read-only diagnostic `docpath status --agent`).
   - Always consume compact machine routes (`docpath next --agent`, `docpath status --agent`).
   - Retrieve topics via token-budgeted commands (`docpath reveal --topic <kw> --level 1`, `docpath context --smart --max-tokens 2000`).
   - Prune context bloat with `docpath budget --agent` / `docpath budget --prune`.

4. **Master-Worker Subagents & Delegation**:
   - **Master-Worker Step Dispatching**: The master agent keeps a minimal context (only inspecting `docpath next`, dispatching tasks, and verifying outcomes). Avoid reading large files or engaging in multi-turn deep editing in the master session. For complex steps (S1..Sn), dispatch dedicated worker subagents via `invoke_subagent`. Workers only read `wip-note.md`, perform the step, exit via `step-pass`, keeping the master context clean.
   - **Bounded Research Scope**: Never issue unconstrained research commands like "thoroughly scan the whole codebase". Research subagent tasks must explicitly specify target paths (≤ 3 files) and a single concrete question, destroying the subagent immediately upon completion.

## Required Gates & Boundaries

1. **State & Preconditions**: Never act from memory alone. Do not hand-edit `state.json` or runtime views. If task identity drifts, do not patch with `agent step`; choose a restore/reset path.
2. **Ambiguity & Decision Brief Gates**:
   - When a product/UI request lacks target user, clarify or run brainstorm/refine first.
   - When changing architecture, technology stack, contracts, agent workflows, boundaries, or long-term maintenance cost, run brainstorm/refine first, record a Decision Brief in spec, and obtain explicit user confirmation.
3. **Compound Closeout**:
   - Prefer `docpath step-pass --commit` / `docpath done --commit` / `docpath quick-done --commit` (which invoke `docpath agent done`).
   - Stage all modified tracked files (`git add .`) including tracked `.docpath/` assets (backlog, rules, AGENTS.md).
   - Local commits only; do not push without explicit user request.

## Living Documentation & Document Standards

1. **Discovery & Inspection (`docpath doc` / `docs`)**:
   - Fast Lookup: Use `docpath doc <keyword>` (or `docpath docs search <keyword>`) to retrieve indexed architecture and feature documentation without brute-force filesystem scans.
   - Architecture Overview: Use `docpath doc arch` to view the bird's-eye matrix of core architecture, protocol designs, and ADRs.
   - Token-Budgeted Context: Use `docpath reveal --topic <kw> --level 1` or `docpath context --smart --max-tokens 2000` for compact context injection.

2. **Strict Document Writing Conventions (文档编写规范)**:
   - **Mandatory Synchronization**: When implementing architectural changes, new features, protocol adjustments, or public contracts, **MUST** update or create corresponding documentation under `docs/` in the same change.
   - **Structured Hierarchy**: Follow standard document structure:
     - Clear Title & Metadata (YAML frontmatter with `kind: architecture|design|feature|reference`, `scope`, `level: 1|2|3`, `status: active|wip|deprecated`).
     - Problem Context & Motivation (Why this design exists).
     - Architecture & Technical Decisions (Core design, invariants, and trade-offs).
     - Interfaces, Data Contracts & Boundaries (Explicit contracts, schemas, error semantics).
     - Verification & Evidence (How the design is validated).
   - **Authentic Code & Symbol References**: Never invent APIs, file paths, or CLI flags. All file links (`file:///...` or repo-relative `docs/...`, `src/...`) and symbol references (`functionName`, `ClassName`) must strictly exist in the codebase.
   - **No Orphan or Dead Docs**: Maintain bi-directional coherence; avoid creating disconnected documents that drift out of sync with code reality.

3. **Governance, Health Checks & Auto-Healing**:
   - **Index Sync**: Run `docpath docs scan` or `docpath docs sync` after adding or updating documentation to refresh `.docpath/docs-index.json`.
   - **Doc Health Checks**: Run `docpath docs doctor` (or `docpath docs lint`) to verify document graph consistency, validate link targets, check for missing frontmatter, and detect orphan documents.
   - **Auto-Fix**: Use `docpath docs fix` (or `docpath doc guard --staged`) to automatically heal fixable lint issues (e.g. frontmatter auto-fill, link normalizations) before closing the task.

## Worktree Concurrent Development

Use `docpath worktree create <name>` only for parallel multi-agent development.
- **Workflow**: `docpath worktree create <name>` → `cd .worktrees/<name>` → `docpath start "<title>" --draft` → `docpath step-pass --commit` → `cd ../.. && docpath worktree finish <name>`.
- **Adoption & Stash**: When existing uncommitted code exists, use `--adopt` (`docpath start "<title>" --draft --adopt`) or `docpath task stash "WIP msg"`.
- **Safety Snapshots**: `docpath worktree remove` automatically creates emergency snapshots under `refs/docpath-backups/` if uncommitted changes exist.
- **Collaboration**: `docpath worktree matrix` (live progress across agents), `docpath worktree broadcast "<msg>"` (broadcast breaking updates).
- Details & isolation model: see `docs/features/worktree-workflow.md`.

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

**Dependencies are NOT isolated** (R-467): `worktree create` symlinks
`node_modules` to the main checkout, so an install inside a worktree writes
through to main; when the worktree is removed, main's `test` breaks with
`ERR_MODULE_NOT_FOUND` *after* an apparently successful merge. `node_modules`
is gitignored, so drift is invisible to merge status — run
`docpath worktree doctor` (dependency isolation / drift checks) before
merging, and always commit `package.json` + lockfile changes on the branch.
<!-- /docpath:block -->

## Linked Project

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
