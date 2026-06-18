## 执行计划

### S1: Locate generated plan persistence path
- **描述**: Inspect `docpath plan` implementation, existing plan parser/validator utilities, and tests that cover generated plan output.
- **验收条件**: Identify the exact mutation point where generated plan content is written and state advances.
- **依赖**: 无

### S2: Add deterministic FR/AC coverage validation
- **描述**: Implement spec id extraction and generated plan coverage validation for explicit `FR-*` and `AC-*` ids.
- **验收条件**: Validator returns missing FR/AC ids without depending on prose semantics.
- **依赖**: S1

### S3: Gate `docpath plan` before write/advance
- **描述**: Wire coverage validation into generated `docpath plan` so incomplete plans fail before writing `plan.md` / `plan.json` or advancing state.
- **验收条件**: Incomplete generated plans leave existing plan artifacts/state unchanged and print actionable diagnostics.
- **依赖**: S2

### S4: Add regression tests
- **描述**: Cover incomplete generated plan failure, no mutation on failure, successful full coverage persistence, and unchanged `write-plan` behavior.
- **验收条件**: New tests fail against previous behavior and pass with the fix.
- **依赖**: S3

### S5: Validate and close out
- **描述**: Run typecheck, targeted tests, full suite, DocPath check/review/journal, and inspect `changes --agent`.
- **验收条件**: Validation passes or any unrelated worktree/tool limitation is explicitly recorded.
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
