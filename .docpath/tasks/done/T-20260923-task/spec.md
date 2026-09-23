# T-20260923-task - 收口口径对齐（第一批）：清理残余三连推荐文案

> backlog_id: R-365
> backlog_source: docpath backlog add

## 1. 背景与动机

另一 agent 已确立「顶层接口聚合、底层机制解耦」原则：`docpath done` 内部即 `check -> review -> journal` 完整门禁序列，因此面向用户的推荐应是**一步到位的复合命令**，`check` / `review` 降级为「中途自测 / 单独排查」的原子工具。

已完成的对齐（基准）：`src/utils/closeout-route.ts`、`src/utils/agent-output/formatters.ts`（3 个分支）、`AGENTS.md` + 模板 + protocol blocks。

本次为**第一批低风险对齐**：把上一轮排查中「文案层」的残留点补齐（不涉及门禁契约层与新增命令）。均为纯文案改动，改法与基准一致。

### 包含
- 上述 5 处文案对齐

### 不包含
- `src/engine/transitions.ts` 的 `preferredWorkflowCommand` / `EVENT_RECOVERY_COMMAND`（门禁契约层，需单独裁定）
- backlog 生命周期聚合命令（需先定聚合边界）
- `done` / `quick-done` / `agent done` 命名收敛
- `src/utils/budget.ts` 措辞口径

## 2. 需求清单

### 功能需求
- [ ] FR-1: 收口口径对齐（第一批）：清理残余三连推荐文案
  - 来源 backlog: R-365

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 收口口径对齐（第一批）：清理残余三连推荐文案

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
- 当前问题: 另一 agent 已确立「顶层接口聚合、底层机制解耦」原则：`docpath done` 内部即 `check -> review -> journal` 完整门禁序列，因此面向用户的推荐应是**一步到位的复合命令**，`check` / `review` 降级为「中途自测 / 单独排查」的原子工具。
- 目标: 收口口径对齐（第一批）：清理残余三连推荐文案
- 背景: 来自 backlog R-365
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

- [ ] AC-1: `src/commands/worktree/query.ts` 的 `suggested_action` 不再输出三连，改为推荐 `docpath done`（并统一箭头写法）；
- [ ] AC-2: `src/commands/check.ts` 通过后的下一步引导改为 `docpath done`，并保留「单独排查可运行 docpath check」的语义；
- [ ] AC-3: `src/commands/check/evidence.ts` 在 `check.passed` / `check.env_exempt` 事件写入的 `currentStep` 文案改为指向 `docpath done`；
- [ ] AC-4: `src/commands/task.ts` reopen 后的闭环提示改为 `docpath done`；
- [ ] AC-5: `src/utils/closeout-route.ts` 文件头注释与已改实现（第 56 行已推荐 `docpath done`）一致；
- [ ] AC-6: 相关既有测试更新且全量 `docpath check` 通过；改动不触及门禁合法性判定逻辑（`isWorkflowGateCommandAllowed` 等）。
- [ ] AC-7: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-8: backlog 条目 R-365 与任务 T-20260923-task 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
