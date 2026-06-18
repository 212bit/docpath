## 执行计划

### S1: Repair runtime lock and init bootstrap
- **描述**: Update lock acquisition to create the lock parent directory, and update `docpath init` existing-project registration to repair missing runtime workspace files without overwriting existing config/rules.
- **验收条件**: Missing `.docpath/workspace/` no longer causes state lock `ENOENT`; existing `.docpath/` projects regain `workspace/state.json`, `workspace/current.md`, and `workspace/breadcrumb.md` through `docpath init`.
- **依赖**: 无

### S2: Preserve dirty guard while allowing target backlog promotion evidence
- **描述**: Add path-level dirty allowlist support and use it in `backlog promote` so capture-created target backlog files can be promoted while unrelated dirty files still block new task start.
- **验收条件**: `backlog capture -> backlog promote <id> --draft` succeeds with only target backlog evidence dirty; `backlog promote` still rejects dirty source files such as `README.md`.
- **依赖**: 无

### S3: Add regression tests for runtime bootstrap and promote guard
- **描述**: Cover lock parent creation, backlog promote with missing runtime workspace, init runtime repair, capture-to-promote dirty evidence, and existing dirty rejection behavior.
- **验收条件**: New tests fail on the previous behavior and pass with the fixes.
- **依赖**: S1, S2

### S4: Validate and close out
- **描述**: Run typecheck, targeted tests, full test suite, DocPath check/review, and inspect `changes --agent` for commit readiness.
- **验收条件**: Typecheck and tests pass; DocPath gates pass or any remaining tool limitation is explicitly recorded.
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S3 → S4
S2 → S3 → S4
