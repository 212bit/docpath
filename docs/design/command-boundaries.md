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

Examples:

- `docpath status --agent`
- `docpath next --agent`
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

## Compatibility

Do not delete or rename existing commands as part of boundary cleanup. Prefer:

- clearer help text;
- protocol and skill wording updates;
- optional aliases in a later phase;
- tests that enforce no hidden LLM expectations and no dry-run side effects.
