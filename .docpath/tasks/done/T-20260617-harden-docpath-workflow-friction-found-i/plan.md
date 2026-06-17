## 执行计划

### S1: Map workflow paths and add focused reproductions
- **描述**: Inspect quick closeout, backlog promote/spec template, next routing, task identity drift, and spec/plan JSON sync paths. Add or identify focused tests that reproduce the Sentinel failure modes before changing behavior.
- **验收条件**: The relevant source/test files are identified, and failing or targeted test cases exist for the high-risk behaviors that can be automated.
- **依赖**: 无

### S2: Harden quick closeout and stale route ownership
- **描述**: Exclude DocPath-owned runtime/status files from quick guarded non-DocPath file limits, and prevent stale `last-check`/debug state from previous tasks from overriding routing for a newly active task.
- **验收条件**: Quick tasks are not blocked by `.docpath/workspace/**` runtime churn, and `next --agent` routes new promoted tasks by their current phase rather than old failed checks.
- **依赖**: S1

### S3: Improve drift and recovery command diagnostics
- **描述**: Update identity drift and promote recovery diagnostics so they name conflicting task IDs and only recommend supported recovery commands, or implement the missing command if that is the smaller compatible fix.
- **验收条件**: Drift output includes actionable repair commands, and CLI hints no longer suggest unsupported `task park`.
- **依赖**: S1

### S4: Add explicit UI gate defaults to promoted specs
- **描述**: Update backlog promote/spec seeding so generated specs include the `### UI 设计门禁` block, and ensure non-UI CLI/script/docs/package tasks can satisfy the gate explicitly.
- **验收条件**: A promoted non-UI task contains the UI gate block and can proceed to `go --step` without missing-template UI blockage.
- **依赖**: S1

### S5: Surface Markdown/JSON machine-truth divergence
- **描述**: Add detection or clear diagnostics when `spec.md`/`plan.md` has diverged from `spec.json`/`plan.json`, pointing users to `write-spec --stdin` or `write-plan --stdin`.
- **验收条件**: A direct Markdown edit produces an actionable diagnostic instead of stale missing-context output.
- **依赖**: S1

### S6: Verify gates and closeout evidence
- **描述**: Run focused tests, broader project checks, DocPath check/review gates, and record reusable lessons if the implementation changes agent workflow expectations.
- **验收条件**: Automated tests and `docpath check` pass, review findings are addressed or explicitly accepted, and task evidence is ready for closeout.
- **依赖**: S2, S3, S4, S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S6
S1 → S3 → S6
S1 → S4 → S6
S1 → S5 → S6
