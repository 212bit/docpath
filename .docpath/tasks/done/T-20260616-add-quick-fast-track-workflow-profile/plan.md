# Plan: Add quick fast-track workflow profile

## 执行计划

- [x] S1: Inspect current state, agent done, runtime routing, and test patterns
- [x] S2: Add workflow profile and quick task creation command
- [x] S3: Make runtime routing and completion gates profile-aware
- [x] S4: Add quick escalation guard and durable audit evidence
- [x] S5: Add tests and update docs/agent guidance
- [x] S6: Run verification gates and close task evidence

### S1: Inspect current state, agent done, runtime routing, and test patterns
- **描述**: Read the specific implementation paths for state persistence, agent/done closeout, next routing, check/review evidence, and existing tests before editing.
- **验收条件**: Affected files and expected integration points are identified; no code edits happen before this inspection.
- **依赖**: 无

### S2: Add workflow profile and quick task creation command
- **描述**: Introduce a backward-compatible profile model and register `docpath quick <title>` to create a minimal active quick task with durable task evidence.
- **验收条件**: The command creates a task id, binds current/canonical task files, sets profile/level appropriately, and appears in command metadata/help.
- **依赖**: S1

### S3: Make runtime routing and completion gates profile-aware
- **描述**: Update `next --agent`, `done`, and lower-level completion policy so quick tasks route directly to edit/check/done and skip review by policy while standard tasks keep existing behavior.
- **验收条件**: Quick route no longer asks for plan; standard route remains unchanged; quick completion requires check evidence but not review_pass.
- **依赖**: S2

### S4: Add quick escalation guard and durable audit evidence
- **描述**: Add a scoped guard for quick task closeout and record review skip/minimal journal evidence in a way future commands can inspect.
- **验收条件**: Oversized or risky quick changes fail loud with upgrade guidance; quick closeout records why review was skipped.
- **依赖**: S3

### S5: Add tests and update docs/agent guidance
- **描述**: Add focused tests for quick command creation, next routing, completion policy, and standard-task regression; update docs/protocol text for when quick is appropriate.
- **验收条件**: Tests cover the new lifecycle and docs describe quick vs standard boundaries.
- **依赖**: S4

### S6: Run verification gates and close task evidence
- **描述**: Run the project test/check commands, fix failures, then run DocPath check/review/done.
- **验收条件**: Verification passes or residual failures are clearly documented; DocPath task is closed with evidence.
- **依赖**: S5
