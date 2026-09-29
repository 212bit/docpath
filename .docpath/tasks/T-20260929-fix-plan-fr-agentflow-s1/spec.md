# T-20260929-fix-plan-fr-agentflow-s1 - fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷

> backlog_id: R-440
> backlog_source: docpath start

## 1. 背景与动机

- fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷

## 2. 需求清单

### 功能需求
- [ ] FR-1: fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷
  - 来源 backlog: R-440

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷

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
- 当前问题: 当开启 agentFlow 且 level <= 2 时，renderDraftPlan 无条件将包含多个 FR（如 6 个 FR、删插件、前端 UI）的任务强行压缩为单步 S1，破坏了「小步快跑」与「架构守卫分层兜底」原则。
- 目标: 优化 renderDraftPlan 判定条件，使多 FR (features.length > 1) 且 level >= 2 的标准任务保持 S1..Sn 模块级多步拆解，单目标 (<= 1 FR) 或 level <= 1 保持单步 S1 压缩。
- 背景: 来自用户真实开发反馈与协议一致性对齐。
- 可选方案:
  - 方案 A (推荐): 修正 `renderDraftPlan` 中的压缩条件为 `level <= 1 || features.length <= 1`，区分单目标极简与多 FR 小步拆解。
  - 方案 B: 废弃整个 agentFlow 计划压缩机制。
- 推荐方案: 方案 A
- 决策理由: 方案 A 既保留了单目标任务的极简体验，又彻底治愈了多模块/跨层任务被粗暴压为单步的架构风险。
- 不做什么: 不修改底层 FSM 状态机转移逻辑。
- 成本: 低，仅修改 plan 渲染逻辑与定向测试。
- 风险: 极低，向下兼容现有单步与多步规范。
- 回滚方案: Git revert 提交。
- 用户确认: 用户已在会话中明确同意优化。

## 5. 验收标准

- [ ] AC-1: fix(plan): 修复多FR任务在agentFlow下被过度压缩为单步S1的缺陷 满足需求并通过门禁
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-440 与任务 T-20260929-fix-plan-fr-agentflow-s1 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
