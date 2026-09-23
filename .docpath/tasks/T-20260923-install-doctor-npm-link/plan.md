## 执行计划

### S1: 实现并验证 install --doctor 检测到 docpath 的 npm-link 目标等于当前工作目录（自引用）时，在漂移报告末尾追加说明：模板修改后的 manifest 漂移为预期行为，请在各受管项目执行 docpath install --force 同步
- [x] S1: 实现并验证 install --doctor 检测到 docpath 的 npm-link 目标等于当前工作目录（自引用）时，在漂移报告末尾追加说明：模板修改后的 manifest 漂移为预期行为，请在各受管项目执行 docpath install --force 同步
- **描述**: 完成 FR-1: install --doctor 检测到 docpath 的 npm-link 目标等于当前工作目录（自引用）时，在漂移报告末尾追加说明：模板修改后的 manifest 漂移为预期行为，请在各受管项目执行 docpath install --force 同步；FR-2: 仅在确属自引用场景才追加说明，不污染普通项目的 doctor 输出，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 自引用场景下 doctor 输出含「npm-link 自引用，漂移为预期」说明；AC-2: 非自引用项目 doctor 输出不变
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
