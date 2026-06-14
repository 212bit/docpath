# S1 Technical Audit - AI command boundaries

## Command boundary classification

### Prompt emitters

- `src/commands/brainstorm.ts`: source comment already says CLI outputs a structured prompt and host Agent writes results through `write-spec`. Dry-run has no-write tests in `tests/brainstorm.test.mjs`.
- `src/commands/refine.ts`: source comment already says prompt-only mode, host Agent generates spec, then `write-spec` persists it. Existing tests cover prompt output and dry-run output.
- `src/commands/analyze.ts`: non-dry-run emits a predev-analysis payload for the Agent to execute and write via `write-analysis`; dry-run explicitly says it is only a preview payload. Existing tests cover no active task failure and dry-run no state-update language.
- `src/commands/plan.ts`: source comment says prompt output and Agent should write plan, but implementation also writes/syncs plan in non-dry-run. This mixed prompt emitter + artifact behavior is the main boundary problem.

### Artifact sinks

- `src/commands/write-spec.ts`: writes active task spec and structured JSON mirrors, transitions to drafting/spec-written.
- `src/commands/write-plan.ts`: validates and writes active task plan plus structured JSON mirrors, transitions to planning.
- `src/commands/write-analysis.ts`: writes active task analysis sections.
- `src/commands/write-design.ts`: writes design artifacts.

### Workflow gates

- `status`, `next`, `go`, `agent enter/step/done`, `check`, `review`, `changes` remain deterministic state, route, lifecycle, validation, review, and git closeout commands.

## Current behavior findings

- `src/utils/agent-prompt.ts` already documents the desired architecture: CLI collects context and emits structured prompt; host Agent reads prompt, reasons, and writes back results.
- `src/commands/register/spec.ts` help text still frames commands as generating final artifacts, for example `plan` is described as `从 spec.md 生成执行计划` and `write-spec` as `从 brainstorm 结果写入 spec.md`; this should be clarified.
- `templates/commands/docpath-plan.md` says `--dry-run` previews without writing files, but the observed current task flow produced plan/state side effects around `docpath plan --dry-run`; this needs regression coverage.
- `src/commands/plan.ts` non-dry-run calls `writeGeneratedPlan`, which reads existing active `plan.md` and writes it to canonical/current. If current or canonical alias is stale, a newly promoted task can inherit an old completed checklist.
- `tests/write-commands.test.mjs` covers `plan` syncing an existing canonical plan and generating a draft plan when none exists, but it does not cover `plan --dry-run` no side effects or promoted-task stale current plan isolation.
- `tests/brainstorm.test.mjs` and `tests/analyze.test.mjs` already model good dry-run/no-write expectations.

## Affected files

### Code likely requiring changes

- `src/commands/plan.ts`
- `src/commands/register/spec.ts`
- Possibly `src/utils/task-files.ts` if stale current/canonical fallback needs stricter task-id isolation.

### Tests likely requiring changes

- `tests/write-commands.test.mjs`
- Possibly `tests/brainstorm.test.mjs`, `tests/refine.test.mjs`, `tests/analyze.test.mjs` for help/prompt wording assertions.
- Possibly `tests/install.test.mjs` for installed slash command/protocol template wording.

### Documentation and protocol likely requiring changes

- `templates/commands/docpath-brainstorm.md`
- `templates/commands/docpath-plan.md`
- `templates/commands/docpath-refine.md`
- `templates/commands/docpath-write-spec.md`
- `templates/commands/docpath-write-plan.md`
- `.opencode/commands/docpath-*.md` installed mirrors as needed
- `.codex/skills/docpath/SKILL.md`
- `templates/codex-skills/docpath/SKILL.md`
- `AGENTS.md`, `CODEX.md`, `CLAUDE.md`, `OPENCODE.md` and protocol templates if command-boundary guidance is added globally.

## Implementation boundary for later steps

- S2 should first add failing tests for `plan --dry-run` no side effects and stale plan isolation, then fix `src/commands/plan.ts`.
- S3 should update CLI help and add a command-boundaries design note or equivalent docs.
- S4 should sync slash command, skill, and protocol templates.
- Do not delete or rename existing commands in this task.
- Keep `.docpath` ignored by default; use `docpath changes --agent` exact canonical evidence for git closeout.
