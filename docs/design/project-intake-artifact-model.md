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
- `analyzed`: structured requirements-shaping analysis exists for the required MVP sections. The `open-questions` section owns the gap index, stakeholder question list, and decision-card candidates.
- `briefed`: requirements brief exists and summarizes goals, actors, scope, non-goals, assumptions, dependencies, risks, acceptance candidates, unresolved gaps, decision cards, and the approval gate.
- `specified`: PRD/spec candidate exists.
- `architected`: architecture brief exists when the project is software delivery work.
- `planned`: milestone or execution plan exists.
- `confirmed`: user explicitly confirmed that project-intake output may become executable work.
- `decomposed`: confirmed output has been converted into backlog items or another executable task plan.
- `blocked`: intake cannot proceed until missing evidence or user decisions are supplied.

## Requirements-Shaping Flow

Project intake is the required flow for brand-new projects or requirement-discussion work that starts from raw material. The flow is:

```text
raw-material capture
-> domain analysis
-> gap index
-> stakeholder questions
-> decision cards
-> requirements approval
-> backlog guidance
```

The CLI stores the current MVP outputs in the existing `analysis/*.md`, `brief.md`, and `backlog.md` files instead of creating separate directories for every intermediate artifact. Agents must still produce the intermediate content explicitly inside those files:

- gap index: each gap has owner, impact, status (`blocking` / `can-mock` / `later`), and confirmation route.
- stakeholder questions: grouped by audience such as business owner, technology owner, compliance, platform team, or external system owner.
- decision cards: problem, options, recommendation, risk, non-goals, owner, and what sections/backlog items the decision unlocks.
- approval gate: who confirmed, what was approved, what remains provisional, and whether backlog decomposition may start.

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

Project-intake artifacts are upstream evidence. They can guide normal backlog items only after explicit user confirmation. The current MVP writes backlog guidance; it does not auto-create executable backlog items.
