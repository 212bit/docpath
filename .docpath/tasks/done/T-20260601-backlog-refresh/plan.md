## 执行计划

### S1: 定义 refresh 命令行为
- [x] S1: 定义 refresh 命令行为
- **描述**: 明确 `docpath backlog refresh` 的 CLI 行为、输出和错误边界。
- **验收条件**: backlog 命令分发表包含 refresh，帮助文案和错误提示包含该动作。
- **依赖**: 无

### S2: 实现 refresh 并补测试
- [x] S2: 实现 refresh 并补测试
- **描述**: 复用 `refreshBacklogIndex()` 重建 `.docpath/backlog/backlog.md`，并增加 CLI 测试覆盖损坏/缺失索引重建。
- **验收条件**: 测试能证明 refresh 重新生成索引且不修改条目状态。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、全量测试、docpath check/review，并 journal 归档。
- **验收条件**: 质量门禁通过，R-050 自动回填 done。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3

