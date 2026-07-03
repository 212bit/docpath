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

- dry-run payload covering requirements, product, UI/UX, technical, risks, and open questions; or
- markdown files under `analysis/`.

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

Errors:

- missing analysis evidence unless `--dry-run`
- empty brief content

### `docpath project plan`

Purpose: create or guide creation of a milestone/execution plan from confirmed project brief/spec evidence.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional.
- `--stdin` optional for persisting already-generated plan content.

Outputs:

- `plan.md`
- state transition to `planned` when persisted.

Errors:

- missing brief/spec evidence
- unconfirmed scope when command would imply executable work

### `docpath project backlog`

Purpose: convert confirmed project-intake output into normal backlog items or emit a backlog-generation preview.

Inputs:

- `<intake-id>` required.
- `--dry-run` optional.
- `--confirm <text>` required for non-dry-run conversion unless already confirmed.

Outputs:

- generated backlog item drafts or persisted backlog items with provenance links.
- project intake state transition to `decomposed` after successful conversion.

Errors:

- missing user confirmation
- missing plan/spec evidence
- generated item does not meet backlog readiness rules

### `docpath project status`

Purpose: print agent-readable project-intake state.

Inputs:

- `<intake-id>` optional; when omitted, list active/recent intakes.
- `--agent` optional YAML output.

Outputs:

- current stage, sources, artifacts, missing evidence, and recommended next command.

Errors:

- unknown intake id.

