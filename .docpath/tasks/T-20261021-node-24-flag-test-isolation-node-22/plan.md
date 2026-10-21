## 执行计划

### S1: 实现并验证 修复测试门禁误注入 Node 24+ 专属 flag：
- [x] S1: 实现并验证 修复测试门禁误注入 Node 24+ 专属 flag：
- **描述**: 完成 FR-1: 修复测试门禁误注入 Node 24+ 专属 flag：；FR-2: test-isolation 在 Node 22 上必然失败，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 按实际 node 主版本选择 flag：>=24 用 --test-isolation=process；22.x 不注入（process 隔离已是默认）；<22 不注入。两处调用点共用同一解析函数并有单测覆盖边界；在 Node 22.22.2 下 docpath 全量测试与 docpath check 恢复正常。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-501 与任务 T-20261021-node-24-flag-test-isolation-node-22 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
