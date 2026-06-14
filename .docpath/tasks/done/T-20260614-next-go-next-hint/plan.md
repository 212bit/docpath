## 执行计划

### S1: R-B 前置重大变更门禁
- **描述**: 在 route 和 execution 前置检查重大变更门禁。`next --agent` 应在门禁缺失时推荐补 spec/refine；`plan`、`go --step`、`agent enter` 应 fail loud，避免实现后才由 `check` 发现。
- **验收条件**: 未完成 Decision Brief 的 workflow/agent 行为任务无法进入 plan/go/agent enter；错误信息包含修复建议；新增测试覆盖 next/plan/go/agent enter。
- **依赖**: 无

### S2: R-A 明确 next/go 协议边界
- **描述**: 更新 agent protocol、skills、templates 和文档，说明 `next --agent` 是 start/resume/uncertain state 的只读路由器，不是显式 deterministic commands 的硬性前置；`go` 是 atomic step control，state-changing commands 必须自行校验。
- **验收条件**: 顶层协议、安装模板、Codex skills、handoff 文案和 getting-started 文档同步新边界；测试断言更新。
- **依赖**: S1

### S3: R-C 统一 state-changing command next_hint
- **描述**: 为核心 state-changing commands 成功输出统一 `next_hint` 文本块，复用现有 route builder 或等价字段，减少 agent 机械重复运行 `next --agent`。
- **验收条件**: plan/go/agent step/check/review/journal/backlog promote 等核心命令成功输出 `next_hint`；输出不破坏既有 human 文案；新增测试覆盖至少 plan、go、agent step、check/review、backlog promote。
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 -> S2 -> S3
