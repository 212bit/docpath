## 执行计划

### S1: 固化规格与并发边界
- **描述**: 核对 spec、现有 session/lock/breadcrumb/plan-sync 代码路径，明确 MVP 不做 multi-active task 和 status --team。
- **验收条件**: spec 包含 Decision Brief 与用户确认；计划拆成可执行工程步骤；不会直接进入未确认范围。
- **依赖**: 无

### S2: 实现 session 与 lease 基础设施
- **描述**: 新增 session id 解析、session 元数据、task/step lease 获取与 stale 接管能力，并保持默认兼容 session。
- **验收条件**: 新模块可在无 session 参数时兼容运行；不同 session 争用同一 task/step 会 fail loud；stale lease 可被接管。
- **依赖**: S1

### S3: 接入 agent/go/breadcrumb/plan 写入路径
- **描述**: 将 session/lease 接入 go、agent enter/step/handoff、runtime breadcrumb 写入；为 breadcrumb 与 plan checklist RMW 加锁；扩展 breadcrumb schema 与 Markdown 视图。
- **验收条件**: breadcrumb JSONL/Markdown 带 session 信息且兼容旧记录；go/agent step 触发 lease 检查；plan sync 并发写入不丢失。
- **依赖**: S2

### S4: 增加测试与协议文档
- **描述**: 增加 session/lease/breadcrumb/plan-sync 相关测试，补充 agent 协议或设计文档说明 MVP 边界。
- **验收条件**: 测试覆盖 session 归属、lease 冲突、stale lease、旧 breadcrumb 兼容、plan sync 锁；文档说明 status --team 和 multi-active task 延后。
- **依赖**: S3

### S5: 运行质量门禁并归档
- **描述**: 运行针对性测试、全量可用测试、docpath check/review/agent done，修复发现的问题。
- **验收条件**: 质量门禁通过；任务进入 completed/review_pass/journal 归档状态。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 -> S2 -> S3 -> S4 -> S5
