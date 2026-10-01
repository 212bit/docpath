# DocPath Agent Protocol

> Shared workflow engine for Codex, Claude Code, OpenCode, and Antigravity.
> **Rule**: Consume DocPath through CLI summaries. JSON/JSONL are machine truth; Markdown files are rendered human views and never default agent inputs.

## First Steps & Access Model

1. **Start/Resume**: `docpath next --agent` is the read-only advisory router. Inspect `next_action`, `recommended_command`, required context, and exit criteria. **Do not re-run `next --agent` after every command (R-460)**: most lifecycle commands already emit a trailing `next_hint` (`next_action` / `recommended_command` / `exit_criteria`) — trust it and act directly, which collapses the per-step loop from 2 round-trips to 1. Only re-run `next --agent` on branch/ambiguity/resume, when the trailing `next_hint` is missing or untrustworthy, or when it points at a repair/investigation path needing re-route.
2. **Access Model**:
   - Runtime state: `.docpath/workspace/state.json` (Read via `next --agent` or `status --agent`)
   - Task spec/plan: `.docpath/tasks/current/spec.json`, `plan.json` (Read via `next`, `go`, `reveal`)
   - Progress events: `.docpath/workspace/breadcrumb.jsonl` (Read via `next`, `status`, `reveal`)
   - Human rendered views (`current.md`, `breadcrumb.md`, `spec.md`, `plan.md`, `docs-index.json`): **Do not read by default**.
   - When details are needed, use `docpath reveal --topic <kw> --level 1` or `docpath context --smart --max-tokens 2000`.

## Agent Lifecycle Commands

<!-- docpath:block lifecycle-commands -->
```bash
# Core 3+1 Loop (日常高频核心闭环):
docpath quick "Fix typo in docs"   # 极简: < 50 行微小改动单行直达 (post-hoc: --adopt)
docpath start "<title>" --draft    # 起手: 1-shot 任务拉起 (promote + plan + go S1)
docpath go --step S1               # 推进: 认领或切换到指定步骤
docpath step-pass --commit         # 步骤收尾 + 终步自动收口提交 (或 step-pass 接力推进)
docpath done --commit              # 复合收口: 1-shot 执行全量门禁 (check -> review -> journal -> commit)

# Advanced / Transitions (辅助与任务调度):
docpath step-skip S2 --reason ".." # 步骤跳过/废弃记录
docpath task stash "WIP msg"       # 暂存当前任务状态与代码变更 (pop 恢复 / switch 切换)
docpath arch check                 # 架构分层防腐检查
docpath gc                         # 工作区历史任务清理
```
<!-- /docpath:block -->

### Lightweighting & Execution Rules (轻量化与执行红线)

1. **Mandatory Tiering (严禁越级大炮打蚊子)**:
   - **Ultra-light (< 50 lines diff, typo, single config, localized fix)**: **MUST** use `docpath quick "<title>"`. (Post-hoc: `--adopt`; upgrade: `quick upgrade`).
   - **【严禁 quick 的红线】**：触及调度器 (`agent.ts`, `check.ts`, `done.ts`, `runtime.ts`)、引擎 (`src/engine/**`)、协议资产或预期 > 50 行代码时，**绝对禁止**使用 `quick`，必须起手 `docpath start <id | "title">`。
   - **Small/Medium (< 100 lines)**: `--level 1`（跳过正式 review 与冗长 journal）。
   - **Architecture / Cross-module**: `--level 2` (Standard Profile)。

2. **Atomic Execution & Zero-Redundancy Gates (零冗余原子收口)**:
   - **Atomic Step Claim**: `docpath go --step <id>` is atomic step control to claim and start steps in 1-shot.
   - **调试期严禁跑全量测试与多余构建**：迭代开发与单用例调试时，**只允许**运行当前模块的单文件定向测试（如 `node --test tests/<file>.test.mjs`, `go test -run`, `pytest`）；步骤验证引擎已内建**构建感知自愈**（源码比产物新时自动增量 build，无需手动 `npm run build`）。**全量测试只跑一次**，由 `docpath done --commit` 或 `docpath step-pass --commit` 在终步收口时原子执行全部门禁（check → review → journal → git commit）。严禁在收口前后手动重复执行 `docpath check` 或全量测试。
   - **AC 不手动打勾**：`spec.md` 中的 `AC-*` 验收标准为静态需求声明，严禁编写脚本或手动编辑将其改为 `[x]`；执行进度完全由 `plan.md` 和 `docpath step-pass`（或 `agent step --step <id> --status done`）驱动。
   - **Edit with tools, not scripts**: Prefer editor tools over shell scripts (`sed`, heredoc) to minimize context re-injection.
   - **Failure handling**: Stop after 2 environment/harness failures and report.

3. **Strict Context Budget & Anti-bloat (严格控制上下文消耗)**:
   - **Trust the trailing `next_hint` (R-460)**: `go` / `step-pass` / `check` / `done` / `plan` / `review` / `journal` end with a concrete `recommended_command`. Execute it directly instead of re-running `docpath next --agent`. The engine also guards against self-loop fallbacks (any recommendation that would re-invoke `next` itself is replaced with the read-only diagnostic `docpath status --agent`).
   - Always consume compact machine routes (`docpath next --agent`, `docpath status --agent`).
   - Retrieve topics via token-budgeted commands (`docpath reveal --topic <kw> --level 1`, `docpath context --smart --max-tokens 2000`).
   - Prune context bloat with `docpath budget --agent` / `docpath budget --prune`.

4. **Master-Worker Subagent & Session Rotation (主从分工与防 Token 爆炸红线)**:
   - **严禁跨 Task 连续长会话**：完成一个 Task 的 `done --commit` 归档后，**必须终结当前会话**，新任务在新会话中启动（`docpath start` / `docpath next --agent`），彻底阻断输入 Token 发生 $O(N^2)$ 平方级爆炸。
   - **Master-Worker 步骤派发**：主调度 Agent 保持上下文极简（仅负责查看 `docpath next`、派发任务、验收结果），禁止在主会话中长篇大论读大文件或陷入多轮深改；复杂步骤（S1..Sn）推荐使用 `invoke_subagent` 派发专职 Worker 子代理，Worker 仅需读取 `wip-note.md` 极简接盘，单步完成通过 `step-pass` 退出，主会话零污染。
   - **Research/Explore 范围红线**：严禁向子代理下达 "thorough scan whole codebase" 等无边界泛化指令；派发调研任务必须精确指定目标路径（≤ 3 个文件）与单一具体问题，探查完毕立即销毁。

## Required Gates & Boundaries

1. **State & Preconditions**: Never act from memory alone. Do not hand-edit `state.json` or runtime views. If task identity drifts, do not patch with `agent step`; choose a restore/reset path.
2. **Ambiguity & Decision Brief Gates**:
   - When a product/UI request lacks target user, clarify or run brainstorm/refine first.
   - When changing architecture, technology stack, contracts, agent workflows, boundaries, or long-term maintenance cost, run brainstorm/refine first, record a Decision Brief in spec, and get explicit user confirmation.
3. **Compound Closeout**:
   - Prefer `docpath step-pass --commit` / `docpath done --commit` / `docpath quick-done --commit` (which invoke `docpath agent done`).
   - Stage all modified tracked files (`git add .`) including tracked `.docpath/` assets (backlog, rules, AGENTS.md).
   - Local commits only; do not push without explicit user request.

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

Linked to: **docpath**
Config: `.docpath/config.yaml`
