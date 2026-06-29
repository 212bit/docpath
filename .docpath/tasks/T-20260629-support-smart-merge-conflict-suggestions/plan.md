## 执行计划

### S1: 设计并在 task-files.ts 中引入三方合并检测与合并函数
- [x] S1: 设计并在 task-files.ts 中引入三方合并检测与合并函数
- **描述**: 在 `src/utils/task-files.ts` 中实现一个 `tryThreeWayMerge` 辅助函数。它使用当前工作区文件的 git 历史或临时基底版本，通过 `git merge-file`（或回退至内存三方合并文本算法）将 `canonical` 漂移内容与 `current` 合并。
- **验收条件**: 模块导出的 `tryThreeWayMerge` 能够成功执行三方合并，或者在冲突时将冲突标记写入目标文件并抛出 Conflict 异常。
- **依赖**: 无

### S2: 在 drift 同步逻辑中接入三方合并
- [x] S2: 在 drift 同步逻辑中接入三方合并
- **描述**: 在 `src/commands/check/validators.ts` 和 `src/utils/task-files.ts` 中，当检查到 `content-mismatch` 且执行 `syncActiveTaskFiles` 时，如果选择三方合并，自动调用 `tryThreeWayMerge` 合并并回写规约和计划文件。
- **验收条件**: 漂移同步选择中，增加并支持自动三方合并选项。
- **依赖**: S1

### S3: 编写对应的单元测试
- [ ] S3: 编写对应的单元测试
- **描述**: 在 `tests/check-review.test.mjs` 或 `tests/helpers.mjs` 相关的测试文件中补充有关 `tryThreeWayMerge` 的单元测试：验证无冲突合并自动写入、有冲突合并写入冲突标记并抛出警报。
- **验收条件**: 单元测试覆盖此漂移场景并 100% 通过。
- **依赖**: S2

## Checklist
- [x] S1
- [ ] S2
- [ ] S3

## 依赖关系图
S1 → S2 → S3
