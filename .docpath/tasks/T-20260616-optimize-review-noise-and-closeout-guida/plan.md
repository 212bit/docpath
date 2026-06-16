## 执行计划

### S1: Implement Review Diff Classification
- **描述**: Add git diff line-range collection and classify review findings as `current_diff` or `baseline_or_whole_file` where practical; persist counts in review evidence and print a concise summary.
- **验收条件**: Tests cover a TODO/console finding on a changed line vs an existing whole-file/function-length warning, with output/evidence counts.
- **依赖**: 无

### S2: Improve Closeout Guidance For Canonical Evidence
- **描述**: Extend changes reports with a `recommended_stage_command` that prefers `docpath commit --stage` when canonical ignored evidence exists while preserving the exact `git add -f` fallback.
- **验收条件**: Agent and JSON output tests assert the new recommendation and existing fallback command.
- **依赖**: 无

### S3: Reduce Done Journal Prompt Noise
- **描述**: Make automatic done/journal closeout print a concise archive summary instead of dumping the full journal prompt, while retaining evidence files and lifecycle behavior.
- **验收条件**: Done/journal tests verify closeout still completes and output no longer includes the large prompt contract in the automatic path.
- **依赖**: 无

### S4: Verify And Close
- **描述**: Run targeted tests, typecheck, DocPath check/review/done, and inspect closeout output.
- **验收条件**: Verification commands pass or residual warnings are documented.
- **依赖**: S1, S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S4
S2 → S4
S3 → S4
