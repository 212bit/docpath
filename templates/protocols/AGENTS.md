# DocPath Agent Protocol

> Shared workflow engine for Codex, Claude Code, OpenCode, and Antigravity.
> **Rule**: Consume DocPath through CLI summaries. JSON/JSONL are machine truth; Markdown files are rendered human views and never default agent inputs.

## First Steps & Access Model

1. **Start/Resume**: `docpath next --agent` is the read-only advisory router. Inspect `next_action`, `recommended_command`, required context, and exit criteria.
2. **Access Model**:
   - Runtime state: `.docpath/workspace/state.json` (Read via `next --agent` or `status --agent`)
   - Task spec/plan: `.docpath/tasks/current/spec.json`, `plan.json` (Read via `next`, `go`, `reveal`)
   - Progress events: `.docpath/workspace/breadcrumb.jsonl` (Read via `next`, `status`, `reveal`)
   - Human rendered views (`current.md`, `breadcrumb.md`, `spec.md`, `plan.md`, `docs-index.json`): **Do not read by default**.
   - When details are needed, use `docpath reveal --topic <kw> --level 1` or `docpath context --smart --max-tokens 2000`.

## Agent Lifecycle Commands

<!-- docpath:block lifecycle-commands -->
```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath start R-101 --draft        # compound: 1-shot start from backlog (promote + plan + go S1)
docpath go --step S1
docpath step-pass                  # compound (R-340): finish current step + auto-start next (or --all)
docpath agent step --step "S1" --status done
docpath check                      # targeted quality check during iteration
docpath done --commit              # compound: full gate sequence (check -> review -> journal -> commit) in 1-shot
docpath quick-done --commit        # compound (R-340): quick gate sequence + commit in 1-shot
```
<!-- /docpath:block -->

### Lightweighting & Execution Rules (轻量化与执行红线)

1. **Mandatory Tiering (严禁越级大炮打蚊子)**:
   - **Ultra-light (< 50 lines diff, typo, single config, localized fix)**: **MUST** use `docpath quick "<title>"`. (Post-hoc: `--adopt`; upgrade: `quick upgrade`).
   - **【严禁 quick 的红线】**：触及工作流协议资产（`.docpath/rules/`、`.docpath/protocols/`、`AGENTS.md`）、跨模块核心安全/权限边界重构，或预期 diff > 50 行代码时，**绝对禁止**使用 `quick`，必须起手 `docpath start <id | "title">`。
   - **Small/Medium (< 100 lines)**: `--level 1`（跳过正式 review 与冗长 journal）。
   - **Architecture / Cross-module**: `--level 2` (Standard Profile)。

2. **Atomic Execution & Zero-Redundancy Gates (零冗余原子收口)**:
   - **Atomic Step Claim**: `docpath go --step <id>` is atomic step control to claim and start steps in 1-shot.
   - **调试期严禁跑全量测试**：迭代开发与单用例调试时，**只允许**运行当前模块的单文件定向测试（如 `node --test tests/<file>.test.mjs`, `go test -run`, `pytest`）；**全量测试只跑一次**，由 `docpath done --commit`（底层调用 `docpath agent done`）在收口时原子执行全部门禁（check → review → journal → git commit）。严禁在调用 `done` 前后手动在终端重复执行 `docpath check` 或全量测试。
   - **AC 不手动打勾**：`spec.md` 中的 `AC-*` 验收标准为静态需求声明，严禁编写脚本或手动编辑将其改为 `[x]`；执行进度完全由 `plan.md` 和 `docpath step-pass`（或 `agent step --step <id> --status done`）驱动。
   - **Edit with tools, not scripts**: Prefer editor tools over shell scripts (`sed`, heredoc) to minimize context re-injection.
   - **Failure handling**: Stop after 2 environment/harness failures and report.

3. **Strict Context Budget & Anti-bloat (严格控制上下文消耗)**:
   - Always consume compact machine routes (`docpath next --agent`, `docpath status --agent`).
   - Retrieve topics via token-budgeted commands (`docpath reveal --topic <kw> --level 1`, `docpath context --smart --max-tokens 2000`).
   - Prune context bloat with `docpath budget --agent` / `docpath budget --prune`.

## Required Gates & Boundaries

1. **State & Preconditions**: Never act from memory alone. Do not hand-edit `state.json` or runtime views. If task identity drifts, do not patch with `agent step`; choose a restore/reset path.
2. **Ambiguity & Decision Brief Gates**:
   - When a product/UI request lacks target user, clarify or run brainstorm/refine first.
   - When changing architecture, technology stack, contracts, agent workflows, boundaries, or long-term maintenance cost, run brainstorm/refine first, record a Decision Brief in spec, and get explicit user confirmation.
3. **Compound Closeout**:
   - Prefer `docpath done --commit` / `docpath quick-done --commit` (which invoke `docpath agent done`).
   - Stage all modified tracked files (`git add .`) including tracked `.docpath/` assets (backlog, rules, AGENTS.md).
   - Local commits only; do not push without explicit user request.

## Worktree Concurrent Development

Use `docpath worktree create <name>` only for parallel multi-agent development.
- **Workflow**: `docpath worktree create <name>` → `cd .worktrees/<name>` → `docpath start R-xxx` → `docpath done --commit` → `cd ../.. && git merge <name> && docpath worktree remove <name>`.
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
<!-- /docpath:block -->

## Linked Project

Linked to: **{{PROJECT_NAME}}**
Config: `.docpath/config.yaml`
