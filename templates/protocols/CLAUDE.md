# DocPath Claude Code Protocol

> This project uses DocPath as the workflow state machine for Claude Code.
> Claude should use DocPath CLI routes and slash commands as the default
> interface. JSON/JSONL files are machine truth sources; Markdown files are
> rendered human views or narrative task documents.

## First Steps

1. Run `/docpath-next` or `docpath next --agent` for the `agent_view: next`
   route, `recommended_command`, and compact workflow snapshot.
2. Follow the returned `recommended_command`.
3. Use `context_index`, `data_index`, and `current_focus` before reading files.
4. Use `/docpath-status` or `docpath status --agent` only for explicit
   status/debug snapshots, suspected drift, or confirmation after state-changing
   commands.
5. Use `/docpath-reveal` or `docpath reveal --topic <keyword> --level 1-3`
   when more detail is needed.
6. Use `/docpath-context` or `docpath context --max-tokens 5000 --topic <keyword>`
   for a budgeted context package.

Do not default-read `.docpath/workspace/current.md`,
`.docpath/workspace/breadcrumb.md`, `.docpath/tasks/current/plan.md`, or
`.docpath/docs-index.json`.

## Slash Commands

Prefer the installed slash commands over long pasted prompts:

```text
/docpath-status
/docpath-next
/docpath-quick Fix typo in docs
/docpath-agent-enter
/docpath-agent-step S1
/docpath-agent-done task
/docpath-check
/docpath-review
/docpath-brainstorm
/docpath-plan
/docpath-go
/docpath-journal
/docpath-continue
/docpath-refine
/docpath-reveal
/docpath-context
```

All commands must point at the same `.docpath/` state. Do not create a parallel
Claude-only state file.

## JSON-First Access Model

| Artifact | Role | Claude access |
| --- | --- | --- |
| `state.json` | Runtime state truth | Use `/docpath-next` or `docpath next --agent` for start/resume; use `/docpath-status` or `docpath status --agent` for diagnostics. |
| `current.md` | Human rendered state view | Do not read by default. |
| `breadcrumb.jsonl` | Execution event truth | Use CLI summaries; direct tail only for debug. |
| `breadcrumb.md` | Human rendered progress view | Do not read by default. |
| `spec.json` | Structured task spec truth | Prefer CLI summaries and schema-aware routes. |
| `spec.md` | Human narrative spec | Read on demand for full requirements. |
| `plan.json` | Structured plan truth | Prefer `/docpath-next`, `/docpath-go`, and reveal. |
| `plan.md` | Human plan view | Do not parse manually by default. |
| `docs-index.json` | Document index truth | Never read in full; use filtered CLI summaries. |

Direct file reads are allowed only when the CLI route, debugging need, or user
request requires them. Keep the read scoped by topic, task id, exact path, or
tail range.

## Command Boundaries

- `/docpath-brainstorm`, `/docpath-refine`, `docpath analyze --dry-run`, and
  `docpath plan --dry-run` are prompt emitters for the current Claude session;
  they do not call a hidden LLM.
- `/docpath-write-spec`, `/docpath-write-plan`, `/docpath-write-design`, and
  `docpath write-analysis` are artifact sinks for content Claude has already
  generated or selected.
- `status`, `next`, `go`, `agent`, `check`, `review`, and `changes` are
  deterministic workflow gates.
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. Claude owns semantic recovery decisions:
  whether a drifted spec is a new task, an old task restore, or a user-confirmed
  reset.
- If `/docpath-next`, `/docpath-status`, `docpath check`, or `docpath task drift` reports task identity drift, do not repair it with `agent step`; choose
  a restore/reset/capture/promote path with explicit user intent.
- `/docpath-next` / `docpath next --agent` is read-only and advisory. Use it at
  session start/resume or when state is uncertain; do not treat it as
  permission, a lock, or a required prelude to an explicit deterministic
  command.
- State-changing commands must re-read workflow state and enforce their own
  preconditions. `docpath go --step <id>` is atomic step control: it
  claims/starts that step only if it is allowed now.
- Treat `--dry-run` output as preview material, not final evidence.

## Lifecycle

<!-- docpath:block lifecycle-commands -->
```bash
docpath quick "Fix typo in docs"   # mandatory for tiny low-risk changes (< 50 lines diff)
docpath go --step S1
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
```
<!-- /docpath:block -->

### Lightweighting & Token Economy (轻量化与 Token 预算准则)

- **Mandatory Workflow Tiering**:
  - `Diff < 50 行` (文案、配置、局部 Bugfix): **必须**使用 `/docpath-quick "<title>"` 或 `docpath quick`。跳过 promotion/spec/plan 阶段，单步进入执行态，减少 70% 交互往返。
  - `Diff < 100 行` (单模块功能、无契约变更): **必须**使用 `--level 1`，精简掉冗余的审查与知识归档仪式。
  - 重大架构/多模块/协议变更: 仅在必要时使用 `level 2` / Standard 流程。
- **Atomic Operations**: 使用 `docpath go --step <id>` 一步认领并启动步骤；中间编码调试阶段避免频繁调用全量 `docpath check`，全量 check 仅在收尾前触发。
- **Context Window Protection**: 严禁全文读取 `plan.md`、`spec.md`、`current.md` 等人类渲染视图；始终消费紧凑机器视图或带 Token 限制的命令 (`/docpath-context`、`docpath reveal --level 1`)。

Workflow:

1. Atomically claim/start the active step with `docpath go --step <id>`; this moves it into executing.
2. Make the scoped change.
3. Record completion with `docpath agent step --step "<id>" --status done`.
4. Run `docpath check` and `docpath agent done` before claiming completion.

## Required Gates

- Do not skip the next route check at start/resume or when state is uncertain.
  Do not require it before an explicit deterministic command; that command must
  enforce its own gate. Use status only for explicit status/debug snapshots,
  suspected drift, or confirmation after state-changing commands.
- Do not act from memory alone.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Product/UI work must clarify target user, entry point, data scope, and
  interaction model before implementation.
- Major changes to architecture, data contracts, UI information architecture,
  workflow behavior, permission boundaries, task scope, existing capabilities,
  or long-term maintenance cost require brainstorm/refine plus a Decision Brief
  and explicit user confirmation before implementation.
- Run `docpath check` before marking work complete.
- `docpath journal` (standalone and via `agent done`) does NOT physically move
  the task directory; it advances state, backfills backlog, and writes lesson
  candidates + decisions. Physical archiving (`tasks/<id>/` → `tasks/done/<id>/`)
  is owned by `docpath gc --force` after closeout. `docpath write-journal`
  (knowledge record into spec.md) must run BEFORE archiving — it fails loud on
  an already-archived task.
- Before any local `git commit`, run `docpath changes --agent`. Treat it as a
  read-only closeout report; only force-add exact canonical evidence paths it
  recommends, and do not force-add `.docpath/tasks/current/*` alias evidence by
  default.

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

- `docpath worktree list` - list all worktrees
- `docpath worktree create <name>` - create new worktree
- `docpath worktree remove <name>` - delete worktree

See `docs/features/worktree-workflow.md` for detailed usage guide.

## Decision Log Aging

- `workspace/decisions.md` keeps recent ADR entries only.
- `docpath journal` rotates older entries into `workspace/decisions-YYYY-MM.md`.
- Read historical monthly archives explicitly instead of loading all decisions.
- Write decisions only for reusable architecture, workflow, or behavior choices
  with context, impact, boundaries, and alternatives.
