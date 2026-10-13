## 执行计划

### S1: 实现并验证 FR-1 DocPath CLI 命令调用频次
- [x] S1: 实现并验证 FR-1 DocPath CLI 命令调用频次
- **描述**: 落地 FR-1: DocPath CLI 命令调用频次，并完成模块定向自验。
- **验收条件**: AC-1: 实现 DocPath CLI 命令调用提取器（从 Bash/run_command 中精准识别提取所有 docpath 子命令调用，统计各子命令频次与错误率）
- **依赖**: 无

### S2: 实现并验证 FR-2 真实 Token 消耗分析引擎
- [x] S2: 实现并验证 FR-2 真实 Token 消耗分析引擎
- **描述**: 落地 FR-2: 真实 Token 消耗分析引擎，并完成模块定向自验。
- **验收条件**: AC-2: 实现 DocPath 命令真实 Token 消耗归因（计算每次 docpath 命令入参与 stdout/stderr 产生的真实 Token 消耗，统计总消耗及子命令排行榜）；AC-3: 在 `docpath monitor`（全局看板与 `--current` 实时视图）中置换并升级「⚡ DocPath 命令调用与 Token 消耗透视」面板，提供 `--agent` 与 `--json`；AC-4: 完成单元测试覆盖并在全量门禁中通过验证；AC-1: DocPath CLI 命令调用频次 满足功能要求并通过测试；AC-2: 真实 Token 消耗分析引擎 满足功能要求并通过测试；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-456 与任务 T-20260930-docpath-cli-token 建立双向关联
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
