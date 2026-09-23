# T-20260923-transitions-check - transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）

> backlog_id: R-366
> backlog_source: docpath backlog add

## 1. 背景与动机

承接 R-365（收口口径对齐第一批）与 2e9ef93（顶层接口聚合原则）：`docpath done` 内部即
`check -> review -> journal` 完整门禁序列，对外推荐应是一步到位的复合命令。

第一批已清理文案层残留，但 `src/engine/transitions.ts` 未动，导致**同一输出内两个字段口径打架**。实测现场（R-365 自身收口时）：

```
下一步: `docpath done` 执行收口门禁（check -> review -> journal）；如需单独排查可运行 `docpath review`
next_hint:
  recommended_command: docpath review      ← 仍指向单步 review
```

根因：`EVENT_RECOVERY_COMMAND`（`transitions.ts:60-75`）与 `preferredWorkflowCommand`
（`:191-215`）中 `check.passed` / `check.env_exempt` 的建议仍为 `docpath review`，而
`formatters.ts` 的同状态分支已改为 `docpath done`。

`preferredWorkflowCommand` 有 5 处消费，语义分两类：

**（一）面向用户的「建议下一步」提示** —— 可安全改为 `done`：
- `src/commands/plan.ts:378`（`建议下一步: ...`）

**（二）FSM 报错/恢复路径** —— 语义为「恢复**这个事件**该敲什么」，改 `done` 会造成语义漂移：
- `transitions.ts:156` `workflowEventBlockReason` 的建议
- `transitions.ts:323` `Illegal workflow transition`（phase 不匹配）的建议
- `transitions.ts:335`（gate 前置不满足）的建议
- `EVENT_RECOVERY_COMMAND` 经 `workflowEventSuggestedCommand` 导出

**关键前提已核实**：`docpath done` / `agent done` **没有 FSM gate 前置**（`agent done` 仅在
`review.skipped` / `review.failed` / `agent.blocked` 处做合法性校验），它自行跑 check/review/
journal 三门禁。因此指向 `done` 在任意 gate 下都合法、不会把用户引入死胡同。

### 包含
- `transitions.ts` 中 check.passed / check.env_exempt 的建议命令口径对齐

### 不包含
- `EVENT_TARGETS` / `requiredGate` / `from` 等门禁合法性数据（契约层，不动）
- backlog 生命周期聚合（另立条目）
- 命令命名收敛与 budget.ts 措辞

## 2. 需求清单

### 功能需求
- [ ] FR-1: transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
  - 来源 backlog: R-366

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）

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
- 当前问题: 承接 R-365（收口口径对齐第一批）与 2e9ef93（顶层接口聚合原则）：`docpath done` 内部即
- 目标: transitions 门禁态建议口径对齐（消除 check 后输出自相矛盾）
- 背景: 来自 backlog R-366
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

- [ ] AC-1: `check.passed` / `check.env_exempt` 在**面向用户**的建议路径上输出 `docpath done`，不再输出 `docpath review`；
- [ ] AC-2: FSM 报错/恢复路径（`workflowEventBlockReason`、`Illegal workflow transition`）的「建议下一步」语义不被破坏——仍给出**当前 phase/gate 下可执行**的命令，不得因改动引入死胡同；
- [ ] AC-3: 消除实测现场的口径打架：`check` 通过后，正文引导与 `next_hint.recommended_command` 指向同一收口入口；
- [ ] AC-4: 既有 FSM / transitions 相关测试全通过；新增断言覆盖「check_pass gate 下建议收口入口」；
- [ ] AC-5: 不改变任何 `EVENT_TARGETS` / `requiredGate` 等门禁合法性判定（只动建议文案）。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-366 与任务 T-20260923-transitions-check 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
