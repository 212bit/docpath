---
related:
  - error-codes.md
  - design/session-isolation-mvp.md
---

# DocPath Command Boundaries

DocPath CLI is the workflow engine for agents. Its core job is not to replace the
current agent session with another hidden reasoning context. The CLI should make
agent work routable, persistent, recoverable, verifiable, and auditable.

## Command Classes

### Prompt Emitter

A prompt emitter prints a structured prompt contract or analysis payload for the
current host agent to execute.

- It may read DocPath state and task artifacts.
- It may print context, instructions, schemas, and recommended write commands.
- It must not call a hidden LLM to produce final task content.
- `--dry-run` must not write files, update state, or advance workflow phase.

Examples:

- `docpath brainstorm`
- `docpath refine`
- `docpath analyze --dry-run`
- `docpath plan --dry-run`

`docpath plan` is a transitional command. It emits the planning prompt and may
write or sync a conservative local plan for continuity, but complex planning
should still be produced by the host agent and persisted with `docpath
write-plan`.

### Artifact Sink

An artifact sink persists content that the host agent has already generated in
the current conversation.

- It validates input where possible.
- It writes canonical task artifacts and current aliases.
- It updates structured JSON mirrors where supported.
- It may advance workflow state because persistence is the explicit command.

Examples:

- `docpath write-spec`
- `docpath write-plan`
- `docpath write-design`
- `docpath write-analysis`
- `docpath write-journal`

### Workflow Gate

A workflow gate is deterministic state, lifecycle, routing, validation, review,
or closeout logic.

- It should not require language-model reasoning to decide its output.
- It should fail loud when required state or evidence is missing.
- It is the source agents use to route work and verify completion.
- `next --agent` is read-only advisory routing, not a permission grant or lock.
- State-changing gates must re-read state and enforce their own preconditions;
  `go --step <id>` is atomic step control that claims/starts a step only when it
  is allowed now.

Examples:

- `docpath next --agent`
- `docpath status --agent`
- `docpath go --step S1`
- `docpath agent enter|step|done|handoff`
- `docpath check`
- `docpath review`
- `docpath changes --agent`

## User Entry Points

User-facing AI content generation should normally start from slash commands or
skills inside the current agent session, such as `/docpath-brainstorm` or a
DocPath skill trigger. Those entries may call CLI prompt emitters and artifact
sinks, but the reasoning and final content generation stay in the current agent
conversation.

## Git Evidence Boundary

Keep `.docpath` ignored by default. Do not unignore the whole directory to make
evidence visible to Git, because that exposes runtime state, installed command
mirrors, indexes, and historical task artifacts.

Before committing, run:

```bash
docpath changes --agent
```

Only force-add exact canonical evidence paths that `docpath changes --agent`
recommends. Do not force-add `.docpath/tasks/current/*` alias evidence by
default.

Canonical evidence examples:

- `.docpath/backlog/R-173.md`
- `.docpath/backlog/evidence/R-173-analysis.md`
- `.docpath/tasks/T-20260614-example/spec.md`
- `.docpath/tasks/T-20260614-example/plan.md`

Runtime or alias paths that should not be default commit targets:

- `.docpath/workspace/*`
- `.docpath/tasks/current/*`
- `.docpath/commands/*`
- `.docpath/bin/*`
- `.docpath/docs-index.json`

## Task Alias And Archive Boundary

`.docpath/tasks/<task_id>/` is the canonical task evidence directory.
`.docpath/tasks/current/` is a runtime alias for the current task, used for
agent ergonomics and structured mirrors. It is not a durable evidence path and
must not be force-added by default.

When `docpath backlog promote <id>` creates a new task, it clears
`.docpath/tasks/current/` before writing the new spec alias. This prevents stale
`plan.json`, stale checklist completion, or old `analysis/*` files from leaking
from a completed task into the newly promoted task.

Completed canonical task directories are intentionally not moved by
`docpath agent done`, `docpath review`, or `docpath changes --agent`. Commit
readiness must be checked while canonical evidence paths are stable.

In this boundary, "done" means logical workflow completion and journal closeout.
It does not mean the physical task directory has already moved to
`.docpath/tasks/done/<task_id>/`. CLI output for the skip path should say that
physical task directory archive is deferred, not that completion failed or that
evidence disappeared.

Workspace aging cleanup and historical task directory candidates can be
previewed with:

```bash
docpath gc
```

Plain `docpath gc` is a dry-run: it reports workspace cleanup candidates
(`check-history.json`, `breadcrumb.jsonl`/`breadcrumb.md`, stale `sessions/`,
and expired `leases/`) and inactive canonical task directories without mutating
workspace evidence. After closeout and human confirmation, `docpath gc --force`
executes the workspace cleanup plan and archives inactive canonical task
directories into `.docpath/tasks/done/`. GC does not make
`.docpath/tasks/current/*` a commit target.

`docpath compact` is not a cleanup trigger. It persists a compact context
package only. `docpath compact --cleanup` is the explicit compatibility entry
for running the same workspace cleanup engine used by `docpath gc --force`.

## Agent Adapter Coverage

`docpath install --target <target>` records installation metadata for adapter
coverage, not the identity of the current session. A project may support several
agents at once:

- `target=codex` covers Codex project instructions and skills.
- `target=claude` covers Claude Code protocol and slash commands.
- `target=opencode` covers OpenCode protocol and commands.
- `target=universal` covers Codex, Claude Code, and OpenCode adapters.

Agent output keeps the legacy `install_health.target` field and also exposes
`install_health.adapters` so agents can distinguish project-level installed
adapter coverage from the current host agent. `install_health.current_agent` is
reserved for explicit session identity such as `DOCPATH_AGENT`; it should not be
inferred from install target alone.

## Compatibility

Do not delete or rename existing commands as part of boundary cleanup. Prefer:

- clearer help text;
- protocol and skill wording updates;
- optional aliases in a later phase;
- tests that enforce no hidden LLM expectations and no dry-run side effects.
