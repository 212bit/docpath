## 执行计划

### S1: Add CLI command metadata and custom help output
- [x] S1: Add CLI command metadata and custom help output
- **描述**: Introduce a centralized command visibility model and replace default top-level help with a curated core command view plus advanced/deprecated guidance.
- **验收条件**: `docpath --help` no longer lists every top-level command; core workflow commands are visible; advanced/deprecated help guidance is visible.
- **依赖**: 无

### S2: Keep advanced commands callable and warn on deprecated commands
- [x] S2: Keep advanced commands callable and warn on deprecated commands
- **描述**: Preserve advanced/internal command registration while hiding it from default help; add warnings for `brainstor`, `disclosure`, and `tdd` without changing their successful behavior.
- **验收条件**: Hidden commands still run when invoked directly; deprecated commands print actionable replacement guidance.
- **依赖**: S1

### S3: Add CLI surface regression tests
- [x] S3: Add CLI surface regression tests
- **描述**: Add tests for default help visibility, direct invocation of advanced commands, explicit command help, and deprecated command warnings.
- **验收条件**: Focused CLI tests fail before the implementation and pass after it.
- **依赖**: S2

### S4: Run validation gates and closeout
- [x] S4: Run validation gates and closeout
- **描述**: Run typecheck, focused tests, full test suite, DocPath check/review/journal, and closeout report from the worktree.
- **验收条件**: Validation passes or remaining issues are explicitly documented; task reaches completed/review_pass.
- **依赖**: S3
