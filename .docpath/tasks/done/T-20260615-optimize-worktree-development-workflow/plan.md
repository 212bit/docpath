## 执行计划

### S1: Add worktree doctor and create guidance
- [x] S1: Add worktree doctor and create guidance
- **描述**: Extend the worktree command with `doctor [name]` readiness checks and update `create` next-step output with session export, doctor, and next-route guidance.
- **验收条件**: Doctor reports pass/warn/fail status for existing worktrees; create output includes `export DOCPATH_SESSION=codex-<name>` and `docpath worktree doctor <name>`.
- **依赖**: 无

### S2: Add worktree-aware closeout classification
- [x] S2: Add worktree-aware closeout classification
- **描述**: Extend `changes` reports with additive worktree isolation metadata that separates expected `.docpath` isolation noise from source/test/doc changes.
- **验收条件**: `changes --agent` and `changes --json` expose worktree isolation counts and files when applicable; existing readiness semantics remain intact.
- **依赖**: S1

### S3: Add regression tests for optimized workflow
- [x] S3: Add regression tests for optimized workflow
- **描述**: Cover create guidance, worktree doctor behavior, and changes closeout classification in focused tests.
- **验收条件**: Focused worktree and changes tests pass after implementation.
- **依赖**: S2

### S4: Run validation gates and closeout
- [x] S4: Run validation gates and closeout
- **描述**: Run typecheck, focused tests, full test suite, DocPath check/review/journal, and changes closeout from the worktree.
- **验收条件**: Validation passes or remaining issues are documented; task reaches completed/review_pass.
- **依赖**: S3
