## 执行计划

### S1: 实现并验证 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）
- [x] S1: 实现并验证 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）
- **描述**: 完成 FR-1: 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推），随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: step-pass / next 输出收尾路线前，基于本次实际 changed files（复用 quick-guard 的 `evaluateQuickScope` / `RISKY_PATH_PATTERNS` 判定）做 scope 分类；；AC-2: 命中 RISKY_PATH_PATTERNS 或 guardedFiles 超 max_changed_files 时，不得把 quick-done 标为「推荐」，应推荐 `check -> review -> agent done`（标准收口）；；AC-3: 仅当改动确实落在 quick 允许范围（scope 判定通过）时，quick-done 才作为推荐项；；AC-4: 收口阶段（所有 plan 步骤已完成）的 next_hint 不应再给 agent enter / 「开始或恢复任务执行」这类执行期提示，应按阶段给出收口命令；；AC-5: 有回归测试覆盖：核心路径改动 -> 推荐不含 quick-done；叶子改动 -> 推荐含 quick-done。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-363 与任务 T-20260923-changed-files-scope-quick-done 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
