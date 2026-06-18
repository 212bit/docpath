## 执行计划

### S1: Map current doctor cleanup boundaries
- **描述**: Inspect current doctor, git hygiene util, command registration, and tests to confirm where cleanup should live and what must remain read-only by default.
- **验收条件**: Implementation boundary is clear: default doctor stays read-only; cleanup uses the runtime-noise whitelist only.
- **依赖**: 无

### S2: Implement explicit untrack-noise cleanup
- **描述**: Add the `--untrack-noise` option, execute `git rm --cached --` only for tracked ignored runtime-noise paths, and render clear human/JSON output for no-op and cleanup cases.
- **验收条件**: Cleanup is opt-in, idempotent, and never targets non-runtime DocPath evidence.
- **依赖**: S1

### S3: Add focused regression tests
- **描述**: Extend doctor tests to cover cleanup in temporary Git repositories and preservation of canonical evidence under broad `/.docpath/` ignore rules.
- **验收条件**: Tests fail before the cleanup implementation and pass after it; default read-only behavior remains covered.
- **依赖**: S2

### S4: Verify gates and closeout readiness
- **描述**: Run focused tests, typecheck/full tests as appropriate, DocPath check/review, and inspect changes output for commit readiness.
- **验收条件**: Automated verification and DocPath gates pass, and closeout scope is understood.
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
