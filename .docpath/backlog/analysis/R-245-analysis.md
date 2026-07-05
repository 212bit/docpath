# R-245 Analysis - Requirements Shaping Intake Workflow

## Requirements

DocPath needs a first-class requirements-shaping workflow for projects that are still in discussion and start from raw materials such as PPT extracts, meeting notes, API documents, policy documents, or rough requirement drafts. The workflow must prevent agents from jumping directly from raw material to executable development backlog. It should guide them through capture, domain analysis, gap indexing, stakeholder questions, decision cards, requirement closeout, approval, and only then backlog guidance.

The user explicitly confirmed option B on 2026-07-05: implement this as a reusable DocPath intake workflow, not as an evoucher-specific document.

## Product

The value is predictable requirement discovery. A user should be able to bring an unclear project to DocPath and get a staged process with explicit outputs and gates:

- raw material provenance
- domain analysis
- gap index with ownership and blocking status
- counterpart questions grouped by audience
- decision cards for assumptions that need owner approval
- approved requirements document
- backlog guidance after approval

Success means agents can no longer treat an intake package as executable work until the shaping flow reaches the approval/backlog stage.

## Technical

Existing `docpath project capture/analyze/brief/backlog` already provides the backbone. The change should preserve that path while making the workflow contract more explicit in agent protocols, docs, command output, and tests. The likely implementation surface is:

- project-intake command output and next hints
- `next --agent` / `status --agent` guidance when intake packages exist
- protocol files under `.docpath/protocols/`
- getting-started or workflow docs
- tests around project intake routing and command guidance

No external LLM or network dependency should be introduced. New outputs should be deterministic prompts, guidance, or templates owned by the current agent session.

## Risks

- Over-constraining the flow could slow tiny requirement clarifications; keep `quick` and ordinary backlog capture for non-project-sized ideas.
- If intake guidance only exists in documentation, agents may still bypass it; route output or command hints must carry the rule.
- If backlog guidance auto-creates executable tasks before approval, it repeats the current failure mode; approval must remain explicit.

## Open Questions

- Exact command naming can follow existing `docpath project` commands instead of adding new top-level commands unless implementation reveals a gap.
- The first implementation can focus on guidance and gates; richer generated artifacts such as dedicated `gaps.md` and `decision-cards/` can be staged if the current project-intake model lacks structured storage.
