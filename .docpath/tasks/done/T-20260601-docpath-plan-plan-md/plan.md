## 执行计划

### S1: 明确 plan 自动写入策略
- [x] S1: 明确 plan 自动写入策略
- **描述**: 确认 `docpath plan` 在无外部 Agent 生成内容时应写入可执行草案，而不是只输出 prompt 后进入 planning。
- **验收条件**: 行为定义清晰，保留 dry-run 预览，不破坏已有 canonical plan 同步逻辑。
- **依赖**: 无

### S2: 实现草案计划生成并补测试
- [x] S2: 实现草案计划生成并补测试
- **描述**: 从 spec 中提取 FR/AC/title，生成结构合法的 plan.md，并写入 current 与 canonical。
- **验收条件**: 新测试证明 `docpath plan` 会创建 plan.md，`next` 推荐 `go --step S1`，`go --dry-run` 可读取。
- **依赖**: S1

### S3: 验证门禁并归档
- [x] S3: 验证门禁并归档
- **描述**: 运行相关测试、全量测试、docpath check/review/journal，并吸收 lesson。
- **验收条件**: 所有门禁通过，R-051 回填 done，next 回到安全出口。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3

