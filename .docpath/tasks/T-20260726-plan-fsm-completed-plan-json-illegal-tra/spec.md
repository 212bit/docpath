# T-20260726-plan-fsm-completed-plan-json-illegal-tra - plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据

> backlog_id: R-291
> backlog_source: docpath backlog capture

## 1. 背景与动机

planCommand（src/commands/plan.ts:329-350）先写盘（writeGeneratedPlan → plan.md+plan.json 双写）再 transitionWorkflow('plan.ready') 校验合法性。completed 等非法阶段误跑 docpath plan 时，canonical 计划证据先被改写才报 Illegal transition：plan.json 时间戳刷新；spec 与旧 plan 有差异时 checklist 勾选被保守草案清零。2026-07-26 本会话三次实测复现（R-286/R-287/R-291 起任务期间），均靠 git checkout 恢复。与 R-279 同族的「写盘先于校验」半执行污染模式。

写盘前用 FSM 单源做前置校验（fail-loud，零写入）：readCurrentState 后、任何写盘前以 listValidWorkflowEvents 判定 plan.ready 合法性，非法即抛错并给出 preferredWorkflowCommand 建议（路由单源，不手写提示）；--dry-run 与 current=null 场景不受影响；transitionWorkflow 持锁校验保留为最终防线。详见 .docpath/backlog/analysis/R-291-analysis.md。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-291-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
  - 来源 backlog: R-291

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

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
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: planCommand（src/commands/plan.ts:329-350）先写盘（writeGeneratedPlan → plan.md+plan.json 双写）再 transitionWorkflow('plan.ready') 校验合法性。completed 等非法阶段误跑 docpath plan 时，canonical 计划证据先被改写才报 Illegal transition：plan.json 时间戳刷新；spec 与旧 plan 有差异时 checklist 勾选被保守草案清零。2026-07-26 本会话三次实测复现（R-286/R-287/R-291 起任务期间），均靠 git checkout 恢复。与 R-279 同族的「写盘先于校验」半执行污染模式。
- 目标: plan 命令写盘先于 FSM 校验: completed 任务 plan.json 被改写后才报 Illegal transition, 半执行污染 canonical 证据
- 背景: 来自 backlog R-291
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-26 用户确认架构 review P0/后续路线并以 continue 授权实施 R-291（写盘前 FSM 前置校验，行为面: 非法阶段由「半执行后报错」改为「零写入 fail-loud」）

## 5. 验收标准

- [ ] AC-1: 非法阶段（completed 等）运行 docpath plan 退出码非零，plan.md/plan.json 与运行前逐字节一致（零写入）。
- [ ] AC-2: 错误信息含非法原因与 FSM 派生的建议下一步命令。
- [ ] AC-3: 合法阶段 plan 行为不变，--dry-run 不受影响；现有测试全绿并新增回归测试。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-291 与任务 T-20260726-plan-fsm-completed-plan-json-illegal-tra 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
