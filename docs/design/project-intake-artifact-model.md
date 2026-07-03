# Project Intake Artifact Model

## Decision

Use `.docpath/project-intake/<intake-id>/` as the canonical artifact root for brand-new project intake.

Do not use `.docpath/projects/` for this workflow. In DocPath, "projects" already refers to registered DocPath project roots surfaced by `docpath projects` and dashboard aggregation. Project intake is not a registered project; it is a pre-execution discovery package inside the current DocPath workspace.

## Directory Layout

```text
.docpath/project-intake/<intake-id>/
  intake.json
  sources/
  analysis/
    requirements.md
    product.md
    ui.md
    technical.md
    risks.md
    open-questions.md
  brief.md
  spec.md
  architecture.md
  plan.md
  backlog.md
```

## State Stages

- `captured`: raw source inventory exists.
- `analyzed`: structured analysis exists for at least the required MVP sections.
- `briefed`: project brief exists and summarizes goals, actors, scope, non-goals, assumptions, dependencies, risks, and acceptance candidates.
- `specified`: PRD/spec candidate exists.
- `architected`: architecture brief exists when the project is software delivery work.
- `planned`: milestone or execution plan exists.
- `confirmed`: user explicitly confirmed that project-intake output may become executable work.
- `decomposed`: confirmed output has been converted into backlog items or another executable task plan.
- `blocked`: intake cannot proceed until missing evidence or user decisions are supplied.

## Source Provenance

Each source entry records:

- stable source id
- user-facing title
- source type
- capture timestamp
- optional original path
- optional copied content path
- optional content hash
- optional excerpt

The MVP supports text/markdown source content and references. Native binary PPT/PDF parsing remains out of scope; users or agents should provide extracted text.

## Implementation Boundary

The state and path types live in `src/engine/project-intake.ts`. CLI commands should use those helpers instead of constructing paths by hand.

Project-intake artifacts are upstream evidence. They can generate or guide normal backlog items only after explicit user confirmation.

