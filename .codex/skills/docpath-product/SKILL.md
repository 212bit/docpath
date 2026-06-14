---
name: docpath-product
description: Product quality lens for requirements PRDs user value journeys metrics and stakeholder tradeoffs
---

# DocPath Product

Use this skill when a DocPath task needs **product analysis**: requirements clarity, PRDs, user value, success metrics, journeys, scope decisions, or stakeholder tradeoffs.

This is a **quality lens** that integrates with the main `docpath` workflow. Use the main `docpath` skill for lifecycle routing (`next`, `go`, `check`, `done`; `status` for diagnostics).

## When to Use

- User asks for requirements analysis, PRD, or backlog shaping
- Task involves "add a page/feature/workflow" before requirements are clear
- Scope boundaries, non-goals, or release slicing need clarification
- Stakeholder tradeoffs, business rules, or policy constraints are in play
- Success metrics or rollout/rollback strategy need definition

## Product Quality Bar

Product analysis must be **durable and specific** enough to guide spec/plan decisions. Cover:

- **Target users**: personas, primary jobs-to-be-done
- **User value**: expected behavior change, why this matters now
- **Success metrics**: signals of success and failure
- **Core journey**: entry points, key steps, exit states
- **Business rules**: permissions, data ownership, policy constraints
- **Scope boundaries**: what's in, what's out, release slicing
- **Assumptions & risks**: what we're assuming, what could go wrong
- **Blocking questions**: decisions needed before implementation

Avoid one-line product conclusions. If details are missing, write explicit assumptions and confirmation questions.

## DocPath Integration

### Analysis Input
Use `docpath analyze` as the structured payload source:

```bash
docpath analyze --mode deep --content "<requirement>"
```

The returned `product` section provides the mandatory structure.

### Analysis Output
Persist product conclusions through DocPath:

```bash
docpath write-analysis --section requirements --stdin
docpath write-analysis --section product --stdin
docpath write-analysis --section risks --stdin
```

### Role Context
Load product role profiles when deeper expertise is needed:

```bash
docpath roles context --role product-director
docpath roles context --role requirement-analyst
docpath roles context --role user-researcher
```

Role output must land in analysis sections or deliverables, not stay in chat only.

### Deliverables
Render structured product artifacts:

```bash
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables render --template competitive-analysis --output .docpath/tasks/current/deliverables/competitive-analysis.md
docpath deliverables check
```

## Boundaries

- Don't approve scope changes by skill authority alone—record in spec/Decision Brief and follow DocPath gates
- Don't treat product analysis as permission to write code—analysis is pre-implementation only
- Product recommendations must land in `analysis/`, `spec`, `plan`, `deliverables/`, or `journal`
