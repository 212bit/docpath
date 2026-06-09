---
name: docpath
description: "Use DocPath as the task state machine in Codex, especially for planning, continuing, reviewing, closing work, or doing pre-development requirements/product/UI/UX/technical analysis before implementation."
---

# DocPath

Use this skill when working in a repository that uses DocPath and the user asks to plan, implement, continue, review, close work, or **analyze before writing code**.

High-signal trigger phrases include:

- "先做开发前分析", "需求分析", "产品分析", "UI 分析", "UX 分析", "技术分析"
- "不要直接写代码", "先帮我分析", "先明确问题", "先列确认问题"
- "用 DocPath 做分析 / 规划 / 继续 / 收尾"
- "添加一个页面 / 管理页面 / dashboard / workflow / settings page" before implementation details are settled

## Required Route

1. Run `docpath status --agent` to read the current finite-state-machine state.
2. Run `docpath next --agent` and follow its `recommended_command` unless the user explicitly changes direction.
3. Read `.docpath/workspace/breadcrumb.md` before making changes when it exists.
4. Before code or document edits in an active task, run `docpath agent enter` only when the route says the task is in an executable phase.
5. After each meaningful sub-task, run `docpath agent step --step "<step>"`.
6. Before claiming completion, run `docpath agent done` or follow the `docpath next --agent` completion route.

If there is **no active task**, do not invent hidden state and do not hand-write `.docpath/workspace/current.md`. Use `docpath next --agent`, backlog/refine/write-spec/plan/go, or the explicit command recommended by DocPath.

## Pre-development analysis route

When the user asks to analyze first, clarify requirements, analyze a page/workflow, or explicitly says not to code:

1. Stay read-only with respect to product code. Collect context from the user's raw requirement, README, existing pages/routes/components, APIs/data models, permissions, and known constraints.
2. Run one of:

```bash
docpath analyze --mode deep --file <requirements-file>
docpath analyze --mode deep --content "<user requirement>"
```

3. Use the returned analysis payload as the mandatory structure for durable analysis. Cover at least:
   - `requirements`: goals, actors, jobs-to-be-done, scope, non-goals, assumptions
   - `product`: user value, success metrics, core journey, business rules, rollout/rollback
   - `ui`: information architecture, page regions, components, states, accessibility, responsive behavior, copy
   - `technical`: affected modules, data/API contracts, permissions, migrations, testing, observability
   - `risks`: product/design/technical/security/maintenance risks
   - `open-questions`: blocking questions and recommended decisions
4. Save each section through DocPath instead of leaving it only in chat:

```bash
docpath write-analysis --section requirements --stdin
docpath write-analysis --section product --stdin
docpath write-analysis --section ui --stdin
docpath write-analysis --section technical --stdin
docpath write-analysis --section risks --stdin
docpath write-analysis --section open-questions --stdin
```

5. Before replying to the user or entering `docpath refine` / `docpath write-spec`, read `analysis/*` and cite the assumptions, risks, and blocking questions.

`docpath analyze --dry-run` previews the full analysis payload without changing DocPath state and without writing `analysis/*`. It is useful for asking confirmation questions, but it is not a completed analysis artifact.

## Role Context

Use role profiles as context, not as an independent workflow:

```bash
docpath roles list
docpath roles context --role product-director
docpath roles context --role design-lead
docpath roles context --role software-architect
docpath roles context --role qa-engineer
```

Choose the smallest role context that matches the work. Role output must be written to task files, analysis sections, deliverables, review notes, or another DocPath evidence location.

## Deliverables

Use deliverables for structured product, design, engineering, or QA outputs:

```bash
docpath deliverables list
docpath deliverables render --template prd --output .docpath/tasks/current/deliverables/prd.md
docpath deliverables render --template architecture-brief --output .docpath/tasks/current/deliverables/architecture-brief.md
docpath deliverables check
```

Deliverables do not replace `spec`, `plan`, `analysis`, `check`, `review`, or `journal`.

## Boundaries

- Do not bypass `spec -> plan -> go -> check -> review -> journal` for implementation tasks.
- Do not create a hidden expert-team state outside `.docpath/`.
- Do not hand-edit `.docpath/workspace/current.md`.
- Do not mark work complete from conversation alone; use DocPath gates and evidence.
- Do not treat a pre-development analysis request as permission to write product code.
