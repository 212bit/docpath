# Project Intake CLI Command Contract

## Namespace

Use `docpath project <action>` for the MVP project-intake workflow.

Rationale:

- `docpath projects` already lists registered DocPath project roots.
- Singular `project` reads as "work on a project intake package".
- A separate namespace avoids overloading backlog capture with project-level semantics.

## Shared Rules

- Commands are deterministic state/artifact operations only.
- Commands must not call external LLMs or network services.
- Prompt-style commands may emit structured prompt payloads, matching existing `analyze --dry-run` and `plan --dry-run` boundaries.
- Commands must write only under `.docpath/project-intake/<intake-id>/` unless explicitly generating normal backlog items after confirmation.
- Commands must preserve existing backlog, quick, spec, and plan behavior.
- Project intake is a requirements-shaping workflow. The required sequence is:
  `capture -> analyze -> gap index/questions/decision cards -> brief with
  approval gate -> settle requirements/architecture/phase scope/approval ->
  backlog guidance`.
- Unapproved intake output is evidence only. It must not be treated as an
  executable backlog item or implementation plan.
- The minimum frozen standards package before development is `requirements.md`
  and `architecture.md`.
  `open-questions.md`, `decisions/*.md`, and `style.md` are optional by
  complexity. `phase-backlog.md` is not required; backlog quality is enforced on
  structured backlog items. Standalone checklist/handoff documents are not
  required standards; gates belong in DocPath checks.
- For phased delivery, settled intake should produce a phase development scope
  baseline such as `docs/phase-1-development-scope.md`. This document records
  approved phase scope and backlog split anchors; it is not a backlog queue and
  must not carry execution status.
- Agents must not treat inferred architecture, draft standards, prototype notes,
  or stale domain language as approved development rules.

## Actions

### `docpath project capture`

Purpose: create a project-intake package from text/markdown source content or source references.

Inputs:

- `--title <title>` required.
- `--content <text>` optional.
- `--file <path>` optional text/markdown file.
- `--stdin` optional.
- `--source-type <type>` optional; defaults to `unknown`.

Outputs:

- `.docpath/project-intake/<intake-id>/intake.json`
- optional copied source under `sources/`
- agent-readable next hint recommending analysis.

Errors:

- missing title
- no content, file, stdin, or source reference
- unsupported binary input in MVP
- duplicate intake id after retry limit

### `docpath project analyze`

Purpose: emit or persist structured analysis guidance for captured materials.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional; emits prompt payload only.
- `--section <requirements|product|ui|technical|risks|open-questions>` optional.
- `--stdin` optional for persisting already-generated analysis content.

Outputs:

- dry-run payload covering requirements, product, UI/UX, technical, risks, open questions, gap index, stakeholder questions, and decision-card candidates; or
- markdown files under `analysis/`.
- dry-run payload identifies the minimum standards package and optional
  artifacts so agents can distinguish approved standards from assumptions.

Errors:

- unknown intake id
- no captured sources
- invalid section
- attempting to mark analyzed without required sections

### `docpath project brief`

Purpose: create or guide creation of `brief.md`.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional.
- `--stdin` optional for persisting already-generated brief content.

Outputs:

- `brief.md`
- state transition to `briefed` when persisted.
- brief guidance must summarize standards package status:
  `requirements.md`, `architecture.md`, and any optional artifacts
  intentionally split out.
- next hint points to `docpath project settle <intake-id> --dry-run`.

Errors:

- missing analysis evidence unless `--dry-run`
- empty brief content

### `docpath project settle`

Purpose: close requirements discussion after analysis and produce development
truth sources.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional.
- `--confirm <text>` required for non-dry-run settle.
- `--approval-state <approved|partial|blocked>` optional; defaults to
  `approved`.
- `--phase <name>` optional; defaults to the first approved phase when present.

Expected outputs:

- approved `docs/requirements.md` or equivalent path.
- frozen `.docpath/rules/architecture.md` or equivalent path.
- phase development scope baseline, for example
  `docs/phase-1-development-scope.md`, when delivery is phased.
- settle evidence under `.docpath/project-intake/<intake-id>/settle.md`.
- intake approval state: `approved`, `partial`, or `blocked`.
- state transition to `settled` when approved/partial, or `blocked` when
  approval state is blocked.

Gate rules:

- unresolved gaps must be classified as `blocking`, `can-mock`, or `later`.
- `blocking` gaps prevent backlog decomposition.
- architecture-impacting decisions must update architecture ADRs or explicit
  architecture pending items.
- backlog guidance can proceed only for approved or partial-approved scope.

### `docpath project backlog`

Purpose: emit backlog decomposition guidance from confirmed project-intake output.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional.
- `--confirm <text>` optional after settle; when omitted, the settle
  confirmation is reused.

Outputs:

- `backlog.md` guidance with provenance links and backlog item command templates.
- project intake state transition to `confirmed` after successful confirmation.
- Guidance must state that `phase-backlog.md` is not a required durable source
  of truth. Future backlog entries must carry structured acceptance,
  dependencies, readiness, evidence, decision references, and user confirmation
  where required.

Errors:

- missing brief evidence
- missing settle evidence
- blocked approval state
- missing user confirmation in settle evidence

### `docpath project status`

Purpose: print agent-readable project-intake state.

Inputs:

- `<intake-id>` optional; when omitted, list active/recent intakes.
- `--agent` optional YAML output.

Outputs:

- current stage, sources, artifacts, missing evidence, and recommended next command.

Errors:

- unknown intake id.
