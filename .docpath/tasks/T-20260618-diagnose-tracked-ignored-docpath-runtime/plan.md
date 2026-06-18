## 执行计划

### S1: Inspect existing Git health and command surfaces
- **描述**: Map current `.gitignore`, staging, status/install health, and any existing doctor/debug command surfaces before choosing the smallest integration point for tracked ignored runtime diagnostics.
- **验收条件**: The affected source files and test files are identified, and the diagnostic placement is chosen without expanding scope into unrelated workflow fixes.
- **依赖**: 无

### S2: Tighten DocPath ignore rules
- **描述**: Replace broad `/.docpath/` ignoring with runtime-only DocPath ignores while preserving `.worktrees/` ignores and durable DocPath evidence visibility.
- **验收条件**: `.gitignore` ignores `.docpath/workspace/`, `.docpath/.install-meta.json`, `.docpath/tasks/current/`, and `.worktrees/` without ignoring `.docpath/backlog/` or `.docpath/tasks/done/`.
- **依赖**: S1

### S3: Add tracked ignored runtime diagnostic
- **描述**: Implement a read-only diagnostic that detects tracked ignored runtime files through Git index/ignore state and emits a concrete `git rm --cached` suggestion for runtime paths only.
- **验收条件**: Runtime paths are reported with cleanup guidance, while canonical DocPath evidence paths are not reported as runtime noise.
- **依赖**: S1, S2

### S4: Verify behavior and closeout gates
- **描述**: Add focused automated tests, run the relevant test suite, run DocPath check/review gates, and record reusable workflow lessons if needed.
- **验收条件**: Focused tests and `docpath check` pass, review is clean or findings are addressed, and task evidence is ready for closeout.
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
