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
  settle.md
  backlog.md
```

Project-intake stores upstream evidence, not the whole development truth source.
After approval, development uses the normal DocPath backlog/spec/plan lifecycle.
Do not introduce `phase-backlog.md` as a durable requirement. Backlog quality is
validated on structured backlog items.

## Project Document Placement

Use `docs/` for human project truth sources that product, engineering, and
stakeholders may inspect directly:

- `docs/requirements.md`: approved requirements source of truth.
- `docs/phase-<n>-development-scope.md`: approved phase scope baseline. It
  describes phase goals, included/excluded scope, capability groups,
  dependencies, mock/real boundaries, and backlog split anchors. It is not a
  task queue and must not carry execution status.
- `docs/open-questions.md`: optional, only when open issues need standalone
  owner/status tracking outside requirements.
- `docs/decisions/*.md`: optional, only when a significant decision needs
  standalone discussion history. Final architecture consequences must still be
  summarized into ADRs.

Use `.docpath/` for agent workflow truth, rules, task state, and evidence:

- `.docpath/rules/architecture.md`: architecture source of truth, including
  module boundaries, dependency direction, ADRs, and forbidden crossings.
- `.docpath/rules/style.md`: optional project-specific coding differences.
- `.docpath/project-intake/`: raw sources, analysis, settle evidence, and
  backlog guidance.
- `.docpath/backlog/`, `.docpath/tasks/`, `.docpath/workspace/`: structured
  backlog, task evidence, and runtime state owned by DocPath commands.

Do not keep checklist, handoff, or phase backlog draft documents as required
project artifacts. If a phase backlog draft exists during migration, convert its
durable scope content into `docs/phase-<n>-development-scope.md` and let
structured DocPath backlog items carry execution status.

Before implementation starts, a project that came through intake must have a
frozen minimum standards package in project-standard locations:

- `requirements.md`: approved requirements source of truth.
- `architecture.md`: module boundaries, dependency direction, ADRs, and
  forbidden crossings.

For phased delivery, a settled intake should also produce a phase development
scope baseline such as `docs/phase-1-development-scope.md` before backlog
decomposition. This phase scope is an input to backlog generation, not a
replacement for structured backlog items.

Optional artifacts are created only when complexity requires them:

- `open-questions.md`: when gaps need owner/status tracking outside
  `requirements.md`.
- `decisions/*.md`: when significant decisions need standalone history; ADRs
  must still be summarized in `architecture.md`.
- `style.md`: when the project has special coding rules beyond team-wide
  language/framework standards.

Standalone checklist or handoff documents are not part of the minimum standards
package. Gates must be machine-enforced by DocPath checks; durable project facts
belong in `requirements.md` or `architecture.md`.

## State Stages

- `captured`: raw source inventory exists.
- `analyzed`: structured requirements-shaping analysis exists for the required MVP sections. The `open-questions` section owns the gap index, stakeholder question list, and decision-card candidates.
- `briefed`: requirements brief exists and summarizes goals, actors, scope, non-goals, assumptions, dependencies, risks, acceptance candidates, unresolved gaps, decision cards, and the approval gate.
- `settled`: settle evidence exists and records approved requirements, architecture, phase scope, gap states, approval state, and backlog eligibility.
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
-> brief with approval gate
-> settle requirements, architecture, phase scope, and approval
-> backlog guidance
```

The CLI stores the current MVP outputs in the existing `analysis/*.md`, `brief.md`, and `backlog.md` files instead of creating separate directories for every intermediate artifact. Agents must still produce the intermediate content explicitly inside those files:

- gap index: each gap has owner, impact, status (`blocking` / `can-mock` / `later`), and confirmation route.
- stakeholder questions: grouped by audience such as business owner, technology owner, compliance, platform team, or external system owner.
- decision cards: problem, options, recommendation, risk, non-goals, owner, and what sections/backlog items the decision unlocks.
- approval gate: who confirmed, what was approved, what remains provisional, and whether backlog decomposition may start.
- standards package status: whether `requirements.md` and `architecture.md` are
  frozen, and which optional artifacts are intentionally used.
- settle evidence: `settle.md` records requirements source, architecture source,
  phase development scope, gap states (`blocking` / `can-mock` / `later`),
  decision outcomes, approval state (`approved` / `partial` / `blocked`), and
  backlog eligibility.

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

Project-intake artifacts are upstream evidence. They can guide normal backlog
items only after settle evidence records explicit user confirmation. The current
MVP writes backlog guidance; it does not auto-create executable backlog items.
Agents must not treat inferred architecture, draft standards, prototype notes,
or stale domain language as approved development rules.
