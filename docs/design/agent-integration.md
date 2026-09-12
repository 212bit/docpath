# DocPath 2.0 Design: Agent Integration

> Status: Draft  
> Date: 2026-05-28  
> Scope: Product/design note only. This document does not define an immediate implementation contract.

## 1. Motivation

DocPath should not be only a CLI that creates `.docpath/` files. To become useful inside AI coding environments such as Claude Code, OpenCode, Cursor, Aider, and GenericAgent, DocPath needs an **agent-facing interface**.

The goal is to make DocPath feel similar in usefulness to systems such as Superpowers, Trellis, and GSD:

| Source | Role in DocPath | Core value |
|---|---|---|
| Superpowers | Discipline layer | Enforce TDD, review, debug protocol, and quality gates. |
| Trellis | Spec memory layer | Preserve project specs, architecture, style, decisions, and lessons across sessions. |
| GSD | Context orchestration layer | Keep long tasks moving with lightweight state, breadcrumb, and next-step guidance. |

In short:

> DocPath = Superpowers-style discipline + Trellis-style memory + GSD-style orchestration.

Or, more product-facing:

> DocPath gives AI agents a project memory, an execution discipline, and a task state machine.

---

## 2. Product Positioning

DocPath should become an **agent-native workflow substrate** for multi-person and multi-agent development teams.

Current product positioning is narrowed in [DocPath 多人团队定位与协作路线图](./team-workflow-positioning.md): DocPath is the AI workflow state layer for teams, not a personal-only helper and not an enterprise compliance platform. The main product promise is that a team can know where a task is, who should take over, whether it can continue, and how to recover when context is interrupted.

Claude Code, OpenCode, Cursor, Aider, GenericAgent, and future coding agents are execution surfaces. DocPath should sit underneath them as the shared workflow, memory, and verification layer.

```text
Claude Code / OpenCode / Cursor / Aider / GenericAgent
        ↓
DocPath agent interface
        ↓
Project state / specs / workflows / checks / review / journal
```

This design keeps DocPath tool-agnostic while still giving each agent runtime the files it expects, such as `CLAUDE.md`, `AGENTS.md`, slash commands, subagent descriptions, and workflow documents.

---

## 3. Three-Layer Model

### 3.1 Discipline Layer — Superpowers-inspired

Question answered:

> Is the agent allowed to continue?

Responsibilities:

- Require a test strategy before behavior-changing implementation.
- Prefer failing tests before implementation when practical.
- Require `check` evidence before a task can be marked complete.
- Require `review` for non-trivial code changes.
- Require structured debug when checks fail.
- Prevent unsupported claims such as “fixed” without evidence.

Likely DocPath surfaces:

```bash
docpath check
docpath review
docpath go
docpath continue
# future: docpath debug
```

Relevant files:

```text
.docpath/tasks/T-*/check.md
.docpath/tasks/T-*/review.md
.docpath/spec/style.md
.docpath/workflows/tdd.md
.docpath/workflows/review.md
.docpath/workflows/debug.md
```

### 3.2 Spec Memory Layer — Trellis-inspired

Question answered:

> What should this project remember across sessions?

Responsibilities:

- Preserve architecture, style, API decisions, domain assumptions, and lessons.
- Turn task outcomes into durable project knowledge.
- Keep specs and plans available outside the model context window.
- Support cross-session and cross-agent continuity.

Likely DocPath surfaces:

```bash
docpath docs
docpath journal
docpath learn
docpath reveal
docpath context
```

Relevant files:

```text
.docpath/spec/architecture.md
.docpath/spec/style.md
.docpath/spec/decisions.md        # possible future file
.docpath/journal/
.docpath/tasks/T-*/spec.md
.docpath/tasks/T-*/plan.md
.docpath/tasks/T-*/learn.md       # possible future file
```

### 3.3 Context Orchestration Layer — GSD-inspired

Question answered:

> Where is the agent now, and what should it do next?

Responsibilities:

- Maintain task state.
- Maintain breadcrumb for long-task recovery.
- Guide the next action.
- Prevent the agent from losing its place during long sessions.
- Support handoff between sessions and tools.

Likely DocPath surfaces:

```bash
docpath status
docpath context
docpath plan
docpath go
docpath continue
docpath resume
```

Relevant files:

```text
.docpath/workspace/current.md
.docpath/workspace/breadcrumb.md
.docpath/tasks/T-*/plan.md
```

---

## 4. Agent-Facing Deliverables

To be usable inside Claude Code and OpenCode, DocPath should generate more than `.docpath/` state files.

Recommended deliverables:

```text
project-root/
├── CLAUDE.md                     # Claude Code entry protocol
├── AGENTS.md                     # tool-neutral agent protocol
├── .claude/
│   ├── commands/                 # Claude slash command definitions
│   └── agents/                   # Claude subagent role definitions
├── .opencode/
│   ├── commands/                 # OpenCode command definitions, if supported
│   └── agents/                   # OpenCode agent role definitions, if supported
└── .docpath/
    ├── workflows/                # workflow protocols
    ├── skills/                   # reusable capability descriptions
    ├── workspace/
    ├── spec/
    └── tasks/
```

The exact runtime-specific folders may evolve, but DocPath should keep a tool-neutral source of truth under `.docpath/` and generate runtime adapters for specific tools.

---

## 5. Skills

A DocPath skill is a reusable capability description for agents. It explains when to activate, what context to read, what commands to run, and what files to update.

Recommended MVP skills:

```text
.docpath/skills/
├── docpath-workflow.md
├── docpath-spec.md
├── docpath-tdd.md
├── docpath-review.md
└── docpath-debug.md
```

### 5.1 docpath-workflow

Purpose:

- Control state-machine execution.
- Read `current.md` and `breadcrumb.md` before action.
- Decide the next workflow step.
- Prevent skipped states.

Triggers:

- Session start.
- User asks to continue.
- User asks what to do next.
- Agent feels uncertain.

Key rule:

> Do not act from memory. Read DocPath state first.

### 5.2 Codex Skills adapter

DocPath can expose native Codex project skills in `.codex/skills/<skill-name>/SKILL.md`, matching Codex's discoverable skill layout instead of relying only on generic project documents.

Installed skills:

- `docpath`: boot/status/next/done safety loop.
- `docpath-product`: product requirements, PRDs, backlog shaping, stakeholder context.
- `docpath-design`: UX/UI exploration, flows, design critique, and interface-quality work.
- `docpath-software`: implementation, refactor, debugging, checks, and evidence.

Install or refresh them with:

```bash
docpath install --target codex
# or install all runtime adapters:
docpath install --target universal
```

Codex can then trigger the relevant skill by intent. Direct prompts can also name a skill explicitly, for example:

```text
Use the docpath-software skill. Check current state, enter the active step, implement S2, and run docpath check.
```

`docpath install doctor --target codex` validates installed Codex skills through the install manifest and checks each `SKILL.md` has YAML frontmatter with a matching `name` and non-empty `description`.

### 5.3 docpath-spec

Purpose:

- Convert ambiguous requests into task specs.
- Maintain architecture and style documents.
- Extract durable lessons from completed work.

Triggers:

- Ambiguous requirement.
- Architecture/API/data model change.
- Cross-session knowledge should be preserved.

### 5.3 docpath-tdd

Purpose:

- Enforce test-first or test-aware implementation.
- Require a test strategy before code changes.
- Record verification evidence in `check.md`.

Triggers:

- Feature implementation.
- Bug fix.
- Refactor with behavior risk.

Escape hatch:

> If tests are impractical, the agent must explain why and provide an alternative verification method.

### 5.4 docpath-review

Purpose:

- Review implementation against spec, plan, style, and risk.
- Record findings in `review.md`.

Triggers:

- After `check` passes.
- Before task completion.
- Before major merge or handoff.

### 5.5 docpath-debug

Purpose:

- Force structured debugging instead of blind patching.

Protocol:

```text
1. Reproduce
2. Observe
3. Hypothesize
4. Isolate
5. Fix
6. Verify
7. Learn
```

Triggers:

- Test failure.
- Runtime error.
- User-reported bug.
- Behavior differs from spec.

---

## 6. Commands

DocPath should expose two command layers:

1. CLI commands for humans and agents.
2. Slash-command wrappers for agent runtimes.

### 6.1 Existing CLI-oriented commands

Current or expected DocPath commands include:

```text
docpath init
docpath status
docpath context
docpath reveal
docpath brainstorm
docpath plan
docpath go
docpath check
docpath review
docpath journal
docpath learn
docpath continue
docpath resume
docpath unlink
```

### 6.2 Recommended slash commands

Recommended Claude/OpenCode-facing commands:

```text
/docpath:boot
/docpath:start <task>
/docpath:next
/docpath:check
/docpath:review
/docpath:debug <symptom>
/docpath:finish
/docpath:handoff
```

### 6.3 Command behavior

#### `/docpath:boot`

Purpose: enter a project safely.

Steps:

```text
1. Read CLAUDE.md or AGENTS.md.
2. Run `docpath status` if available.
3. Read `.docpath/workspace/current.md`.
4. Read `.docpath/workspace/breadcrumb.md` if present.
5. Run `docpath context` or `docpath reveal --level 1` if more context is needed.
6. Output current state, next action, and risks.
```

#### `/docpath:start <task>`

Purpose: start a new task.

Steps:

```text
1. Classify task complexity L0-L3.
2. For L0, answer or act directly.
3. For L1, create lightweight task state.
4. For L2+, create or update spec and plan.
5. Update current.md and breadcrumb.md.
```

#### `/docpath:next`

Purpose: continue the current workflow one small step.

Steps:

```text
1. Read current.md.
2. Read breadcrumb.md.
3. Determine next action from state.
4. Execute exactly one bounded step.
5. Update breadcrumb.md.
```

#### `/docpath:finish`

Purpose: close a task with evidence and memory.

Steps:

```text
1. Ensure check evidence exists.
2. Ensure review exists when required.
3. Run journal/learn.
4. Update long-lived specs if needed.
5. Move state to completed or idle.
```

#### `/docpath:handoff`

Purpose: prepare cross-session continuation.

Steps:

```text
1. Summarize current task.
2. Record completed steps.
3. Record next step.
4. Record blockers and risks.
5. Update breadcrumb.md.
```

---

## 7. Agents

Agents can begin as Markdown role definitions. They do not need to require real multi-agent execution in the MVP.

Recommended agent roles:

```text
.claude/agents/ or .opencode/agents/
├── docpath-planner.md
├── docpath-implementer.md
├── docpath-tester.md
├── docpath-reviewer.md
├── docpath-debugger.md
└── docpath-archivist.md
```

### 7.1 docpath-planner

Inputs:

```text
spec.md
architecture.md
style.md
```

Outputs:

```text
plan.md
breadcrumb.md update
```

Responsibilities:

- Break work into small steps.
- Identify dependencies.
- Identify risk.
- Identify verification strategy.

### 7.2 docpath-implementer

Inputs:

```text
plan.md
breadcrumb.md
```

Outputs:

```text
code changes
breadcrumb.md update
```

Responsibilities:

- Execute one bounded plan step.
- Avoid scope expansion.
- Record progress.

### 7.3 docpath-tester

Inputs:

```text
spec.md
plan.md
code diff
```

Outputs:

```text
check.md
test evidence
failure evidence when applicable
```

Responsibilities:

- Decide test strategy.
- Run verification.
- Record exact commands and results.
- Trigger debug when verification fails.

### 7.4 docpath-reviewer

Inputs:

```text
spec.md
plan.md
check.md
code diff
style.md
```

Outputs:

```text
review.md
```

Responsibilities:

- Review correctness against spec.
- Review style and maintainability.
- Identify edge cases and regression risks.
- Prefer findings over direct edits.

### 7.5 docpath-debugger

Inputs:

```text
error logs
failed checks
reproduction steps
relevant code
```

Outputs:

```text
debug notes
minimal fix
verification evidence
lesson candidate
```

Responsibilities:

- Reproduce before fixing.
- Gather evidence.
- List hypotheses.
- Isolate cause.
- Apply minimal fix.
- Verify and record lesson.

### 7.6 docpath-archivist

Inputs:

```text
spec.md
plan.md
check.md
review.md
debug notes
final diff
```

Outputs:

```text
journal entry
learned lessons
architecture/style update suggestions
state cleanup
```

Responsibilities:

- Extract durable knowledge.
- Update project memory.
- Prepare clean handoff or closure.

---

## 8. Workflows

Workflows are explicit step-by-step protocols. They should live under `.docpath/workflows/` and be referenced by `CLAUDE.md`, `AGENTS.md`, skills, and commands.

Recommended MVP workflows:

```text
.docpath/workflows/
├── boot.md
├── start-task.md
├── l0-quick-task.md
├── l1-light-task.md
├── l2-standard-task.md
├── l3-complex-task.md
├── tdd.md
├── review.md
├── debug.md
├── handoff.md
└── journal.md
```

Each workflow should answer:

```text
1. When to use
2. Required inputs
3. Steps
4. Exit criteria
5. Files to update
```

Example: `debug.md`

```text
When:
- Test failure
- Runtime error
- User reports a bug
- Behavior differs from spec

Steps:
1. Reproduce the issue.
2. Collect logs, stack traces, state, and environment facts.
3. Write hypotheses.
4. Test hypotheses one by one.
5. Apply the smallest fix.
6. Run regression checks.
7. Record lessons.

Exit criteria:
- Failure was reproduced or explicitly classified as non-reproducible.
- Fix has verification evidence.
- check.md is updated.
- lesson candidate is recorded when useful.
```

---

## 9. Claude Code Integration

Claude Code should use `CLAUDE.md` as the primary entry point.

Recommended structure:

```text
project-root/
├── CLAUDE.md
├── .claude/
│   ├── commands/
│   │   ├── docpath-boot.md
│   │   ├── docpath-start.md
│   │   ├── docpath-next.md
│   │   ├── docpath-check.md
│   │   ├── docpath-review.md
│   │   └── docpath-handoff.md
│   └── agents/
│       ├── docpath-planner.md
│       ├── docpath-reviewer.md
│       ├── docpath-debugger.md
│       └── docpath-archivist.md
└── .docpath/
    ├── workflows/
    └── skills/
```

`CLAUDE.md` should remain short. It should not contain every workflow detail.

Recommended `CLAUDE.md` responsibilities:

```text
1. Tell Claude that this project uses DocPath.
2. Require boot sequence at session start.
3. Require current.md and breadcrumb.md before action.
4. Require spec/plan for non-trivial work.
5. Require check/review before completion.
6. Point to .docpath/workflows/ and .docpath/skills/ for details.
```

This keeps startup context small while preserving deeper protocol files for when they are needed.

---

## 10. OpenCode Integration

OpenCode should use a tool-neutral entry file plus optional runtime-specific command and agent definitions.

Recommended structure:

```text
project-root/
├── AGENTS.md
├── .opencode/
│   ├── commands/
│   │   ├── docpath-boot.md
│   │   ├── docpath-start.md
│   │   ├── docpath-next.md
│   │   └── docpath-review.md
│   └── agents/
│       ├── docpath-planner.md
│       ├── docpath-reviewer.md
│       └── docpath-debugger.md
└── .docpath/
```

If OpenCode does not support a specific folder convention in a given environment, `AGENTS.md` should remain enough to instruct the agent.

Recommended `AGENTS.md` responsibilities:

```text
1. State that this project uses DocPath.
2. Require reading current.md and breadcrumb.md.
3. Require following .docpath/workflows/.
4. Require check/review gates for code changes.
5. Require updating breadcrumb before stopping.
```

---

## 11. Context Loading Strategy

The largest UX risk is over-documentation. If agents must read too much before every action, DocPath will feel slow and heavy.

DocPath should use progressive disclosure.

### Level 0 — Minimal context

Read:

```text
CLAUDE.md or AGENTS.md summary
.docpath/workspace/current.md
.docpath/workspace/breadcrumb.md
```

Use for:

```text
small answers
status checks
simple continuation
```

### Level 1 — Task context

Read:

```text
current.md
breadcrumb.md
current task.md or plan.md
style.md summary
```

Use for:

```text
single-file changes
light tasks
bounded fixes
```

### Level 2 — Standard context

Read:

```text
task spec.md
task plan.md
architecture.md
style.md
check.md
review.md when present
```

Use for:

```text
multi-file changes
feature work
bug fixes
refactors
```

### Level 3 — Full context

Read:

```text
relevant specs
architecture decisions
journal entries
lessons
full task history when required
```

Use for:

```text
architecture changes
long-running tasks
cross-session work
multi-agent work
```

This strategy maps naturally to existing commands such as:

```bash
docpath reveal --level 1
docpath reveal --level 2
docpath context
```

---

## 12. Link Semantics

`docpath init --link <path>` should be understood as more than a directory shortcut.

Product meaning:

> Attach this project to another DocPath brain.

Shared brain may include:

```text
spec memory
workflow state
review discipline
TDD configuration
breadcrumb context
journal/lessons
```

Important use cases:

1. Monorepo subprojects sharing one workflow state.
2. Multiple repositories sharing product-level specs.
3. New projects inheriting old project decisions after a split.

This makes link a key collaboration primitive for the three-layer model:

```text
Trellis layer: shared memory
GSD layer: shared state and breadcrumb
Superpowers layer: shared discipline configuration
```

---

## 13. Recommended MVP

Do not start with a complex runtime or hard enforcement engine. Start with files that agents can read and follow.

### Phase 1 — Protocol documents

Generate:

```text
CLAUDE.md
AGENTS.md
.docpath/workflows/*.md
.docpath/skills/*.md
```

Goal:

> Agents know how to use DocPath.

### Phase 2 — Slash command wrappers

Generate:

```text
.claude/commands/docpath-boot.md
.claude/commands/docpath-start.md
.claude/commands/docpath-next.md
.claude/commands/docpath-check.md
.claude/commands/docpath-review.md
.claude/commands/docpath-handoff.md
```

Optional OpenCode equivalents:

```text
.opencode/commands/*.md
```

Goal:

> Users can trigger DocPath workflows naturally inside agent tools.

### Phase 3 — Agent role definitions

Generate:

```text
.claude/agents/docpath-planner.md
.claude/agents/docpath-reviewer.md
.claude/agents/docpath-debugger.md
.claude/agents/docpath-archivist.md
```

Optional OpenCode equivalents:

```text
.opencode/agents/*.md
```

Goal:

> Complex tasks can be split into specialized roles without requiring full automation yet.

### Phase 4 — Soft gates before hard gates

Add warnings before enforcement:

```text
- warn if check is missing before completion
- warn if review is missing for L2/L3 tasks
- warn if breadcrumb is stale
- warn if spec/plan is missing for non-trivial work
```

Only after the workflow proves useful should DocPath add hard blocking rules such as `enforce_tdd` and `enforce_review`.

---

## 14. Possible CLI Surface

Two possible installation styles:

### Option A — target-aware init

```bash
docpath init --target claude
docpath init --target opencode
docpath init --target universal
```

Pros:

- Simple mental model.
- One command for new projects.

Cons:

- `init` may become too broad.

### Option B — install adapters

```bash
docpath install claude
docpath install opencode
docpath install universal
```

Pros:

- Separates project state initialization from agent-runtime integration.
- Easier to run later in existing projects.

Cons:

- Adds a new command.

Recommendation:

> Prefer `docpath install <target>` for agent adapters, while keeping `docpath init` focused on core `.docpath/` initialization.

---

## 15. Agent Instruction Output

DocPath commands should not only print human summaries. They should also print the next instruction in a form that agents can follow.

Example:

```yaml
state: spec_written
next_action: run_plan
recommended_command: docpath plan
required_context:
  - .docpath/tasks/T-xxx/spec.md
  - .docpath/spec/architecture.md
  - .docpath/spec/style.md
must_update:
  - .docpath/tasks/T-xxx/plan.md
  - .docpath/workspace/current.md
  - .docpath/workspace/breadcrumb.md
exit_criteria:
  - plan.md exists
  - plan includes verification strategy
```

Possible flags:

```bash
docpath context --agent
docpath status --agent
docpath next --explain
```

This is important because agents need operational guidance, not just descriptive output.

### 15.1 Ultra-compact route output (R-339)

Agents call `next --agent` frequently; the full YAML (context injection, refs,
progress, diagnostics) costs ~500+ tokens per call. For hot-path routing use:

```bash
docpath next --agent --compact
```

`--compact` renders only the core routing fields (`agent_view`, `state`,
`next_action`, `recommended_command`, `step_id`), cutting token consumption by
60%+ (well under 200 tokens per call). Non-core metadata stays available on
demand via `docpath reveal` / `docpath status --agent`.

Example:

```yaml
agent_view: next
state: executing
next_action: 执行下一个未完成步骤: S2 implement routing
recommended_command: docpath go --step S2
step_id: S2
```

`step_id` is derived from the recommended command's `--step` argument, falling
back to `state.current_step` when the route has no step.

---

## 16. Risks and Design Constraints

### 16.1 Risk: Too much ceremony

Mitigation:

- Use complexity levels.
- Keep L0 lightweight.
- Use progressive context disclosure.
- Make workflows proportional to risk.

### 16.2 Risk: Runtime-specific lock-in

Mitigation:

- Keep `.docpath/` as the source of truth.
- Generate Claude/OpenCode adapters from shared templates.
- Maintain `AGENTS.md` as a generic fallback.

### 16.3 Risk: Agents ignore documents

Mitigation:

- Keep entry files short.
- Put mandatory rules at the top.
- Provide slash commands for common workflows.
- Make CLI output include next actions.

### 16.4 Risk: Hard enforcement hurts UX

Mitigation:

- Start with warnings.
- Add hard gates only behind config flags.
- Keep escape hatches with explicit explanation and evidence.

---

## 17. Summary

DocPath should integrate with Claude Code and OpenCode by providing an agent-facing interface made of:

```text
1. Entry protocols: CLAUDE.md and AGENTS.md
2. Skills: workflow, spec, TDD, review, debug
3. Commands: boot, start, next, check, review, finish, handoff
4. Agents: planner, implementer, tester, reviewer, debugger, archivist
5. Workflows: boot, task lifecycle, TDD, review, debug, handoff, journal
6. CLI agent output: next-action instructions
```

The strategic direction is reasonable if DocPath remains lightweight:

> Tool runtimes execute. DocPath remembers, disciplines, and orchestrates.

The recommended next step is not hard enforcement or complex automation. The recommended next step is to generate clear protocol files and slash-command wrappers so Claude Code and OpenCode can reliably use DocPath today.


## 开发前分析工作流

当需求还没有达到可直接写入 `spec.md` 的程度，Agent 应先使用：

```bash
docpath analyze --file requirements.md
# 将模型输出审阅/补全后：
docpath write-analysis --section requirements --stdin
docpath write-analysis --section ui --stdin
docpath refine --file .docpath/tasks/current/analysis/requirements.md
```

`analysis/` 是 spec 前的准备产物目录，按 requirements/product/ui/technical/risks/open-questions 分区，兼容旧 `analysis.md`。它不替代 `spec.md`，而是作为 `write-spec` / `plan` 前的输入材料。
