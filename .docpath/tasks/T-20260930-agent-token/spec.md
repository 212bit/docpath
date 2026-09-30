# T-20260930-agent-token - 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系

> backlog_id: R-450
> backlog_source: docpath backlog add

## 1. 背景与动机

### 背景与痛点
DocPath 现有监控（stats/budget）主要基于静态配置与离线度量，缺乏对真实 Agent 会话（如 Antigravity / Claude Code / OpenCode）交互日志（Transcript Logs）的深度挖掘与行为合规审计。当前无法自动检测 Agent 工具滥用（如连续全量大文件读取）、长会话未轮转、协议 Token 恶性膨胀与漂移（Token Drift）、以及规避调度红线的违规行为。

### 验收标准
- [ ] AC-1: 设计统一 Agent 会话遥测接口（AgentTelemetryAdapter），首发支持 Antigravity 与标准环境变量适配
- [ ] AC-2: 实现会话级合规行为审计引擎（检测违规 quick、大文件滥读、死循环卡点、跨任务长会话未轮转）
- [ ] AC-3: 实现 Token 漂移与突增告警机制（基线偏离预警、协议膨胀率计算）
- [ ] AC-4: 提供 docpath monitor 监控大盘（含人类交互视图、--agent 紧凑视图及 --strict 门禁检测）

## 2. 需求清单

### 功能需求
- [ ] FR-1: 基于 Agent 会话日志的流程合规审计
  - 来源 backlog: R-450
- [ ] FR-2: Token 消耗漂移监控体系

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
- 目标: 基于 Agent 会话日志的流程合规审计与 Token 消耗漂移监控体系
- 背景: 来自 backlog R-450
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 基于 Agent 会话日志的流程合规审计 满足功能要求并通过测试
- [ ] AC-2: Token 消耗漂移监控体系 满足功能要求并通过测试
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-450 与任务 T-20260930-agent-token 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
