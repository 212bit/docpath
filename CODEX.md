# DocPath Codex Protocol

> This file is the Codex fallback protocol. Prefer `AGENTS.md` when the agent
> surface supports it.

## Start Here

1. Run `docpath next --agent` for the `agent_view: next` route,
   `recommended_command`, and compact workflow snapshot.
2. Use the returned route and indexes before reading files.
3. Use `docpath status --agent` only for explicit status/debug snapshots,
   suspected drift, or confirmation after state-changing commands.
4. Expand details with `docpath reveal --topic <keyword> --level 1-3` or
   `docpath context --max-tokens 5000 --topic <keyword>`.

## Access Model

- Agents should use DocPath CLI output as the default context.
- JSON/JSONL files are machine truth sources.
- Markdown files are rendered human views or narrative task documents.
- Do not default-read `.docpath/workspace/current.md`,
  `.docpath/workspace/breadcrumb.md`, `.docpath/tasks/current/plan.md`, or
  `.docpath/docs-index.json`.
- Direct reads are only for explicit debugging, schema inspection, or full
  narrative requirements after the CLI route indicates that more detail is
  needed.

## Command Boundaries

- `brainstorm`, `refine`, `analyze --dry-run`, and `plan --dry-run` are prompt
  emitters for the current Codex session; they do not call a hidden LLM.
- `write-spec`, `write-plan`, `write-design`, and `write-analysis` are artifact
  sinks for content Codex has already generated or selected.
- `status`, `next`, `go`, `agent`, `check`, `review`, and `changes` are
  deterministic workflow gates.
- CLI owns mechanical consistency checks: task identity, current/canonical task
  file sync, state transition legality, plan/breadcrumb alignment, install
  health, and closeout evidence. Codex owns semantic recovery decisions: whether
  a drifted spec is a new task, an old task restore, or a user-confirmed reset.
- If `next`, `status`, `check`, or `tasks drift` reports task identity drift, do
  not repair it with `agent step`; choose a restore/reset/capture/promote path
  with explicit user intent.
- `docpath next --agent` is read-only and advisory. Use it at session
  start/resume or when state is uncertain; do not treat it as permission, a
  lock, or a required prelude to an explicit deterministic command.
- State-changing commands must re-read workflow state and enforce their own
  preconditions. `docpath go --step <id>` is atomic step control: it
  claims/starts that step only if it is allowed now.
- Treat `--dry-run` output as preview material, not final evidence.

## Lifecycle

```bash
docpath agent enter
docpath go --step S1
docpath agent step --step "S1" --status done
docpath check
docpath agent done --step "<task>"
docpath agent handoff
```

## Rules

- Do not act from memory alone.
- Keep changes scoped to the active task.
- Do not hand-edit `state.json`, workspace runtime views, or generated Markdown
  views.
- Use lifecycle commands for progress and completion evidence.
- Clarify ambiguous product/UI requests before implementation.
- For major architecture, data, workflow, permission, or long-term maintenance
  changes, run brainstorm/refine and record a Decision Brief before coding.
- Run `docpath check` before marking work complete.
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
docpath agent enter
docpath agent step --step S1
# ... develop ...
docpath check
git commit

# Merge back to main
cd ../../
git merge feature-a
docpath worktree remove feature-a
```

### Worktree Isolation

**Shared resources** (via symlink):
- `.docpath/backlog/` - needs global view
- `.docpath/rules/` - consistent rules across worktrees

**Isolated resources** (independent):
- `.docpath/workspace/` - each worktree has its own state.json
- `.docpath/tasks/` - each worktree has its own tasks
- `.docpath/journal/` - independent archives

**Result**: Each worktree runs as an independent DocPath workspace, sharing only
the requirement pool and rules.

### Commands

- `docpath worktree list` - list all worktrees
- `docpath worktree create <name>` - create new worktree
- `docpath worktree remove <name>` - delete worktree

See `docs/features/worktree-workflow.md` for detailed usage guide.

## Linked Project

Linked to: **docpath**
Config: `.docpath/config.yaml`
