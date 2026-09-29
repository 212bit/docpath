# T-20260929-feat-guard-dirty-guard - feat(guard): 执行期 Dirty Guard 重规划智能自愈与同任务变更自动放行

> backlog_id: R-444
> backlog_source: docpath backlog add

## 1. 背景与动机

在任务执行中途使用 `docpath plan --force` 或 `docpath write-plan` 修正计划后，状态回到 `planning` 阶段。
此时再次运行 `docpath go --step S1`，`assertNoNonDocPathChangesForExecutionStart` 会由于当前 phase 为 `planning`（不在 `ACTIVE_TASK_PHASES` 中）而将该任务此前步骤自己产生的工作区 tracked 变更误判为外部 dirty 变更并强制拦截，强迫用户手动传递 `--accept-dirty`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 在 `git-dirty-guard.ts` 中增强活跃任务判定，当 phase 为 `planning` 但当前 `state.task_id` 匹配且已存在执行事件（如 breadcrumb 中已发生过 `step.started`），或为同一任务的重规划重入时，判定为活跃任务。
  - 来源 backlog: R-444
- [ ] FR-2: 处于活跃任务期内的同任务 tracked 变更（非未跟踪的新增噪音文件）自动放行，不再强制拦截要求 `--accept-dirty`。
- [ ] FR-3: 补充单元测试验证重规划场景下 `docpath go` 的放行行为，并通过质量门禁。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- feat(guard): 执行期 Dirty Guard 重规划智能自愈与同任务变更自动放行

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
- 当前问题: 在任务执行中途使用 `docpath plan --force` 或 `docpath write-plan` 修正计划后，状态回到 `planning` 阶段。
- 目标: feat(guard): 执行期 Dirty Guard 重规划智能自愈与同任务变更自动放行
- 背景: 来自 backlog R-444
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

- [ ] AC-1: 同任务在执行中途重规划回到 `planning` 状态后，`docpath go --step <step>` 对本任务已跟踪修改自动放行
- [ ] AC-2: 未开工的全新任务在 `planning` 状态下如果有外部 dirty 变更，仍严格拦截防污染
- [ ] AC-3: 补充对应的单元测试并通过质量门禁
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-444 与任务 T-20260929-feat-guard-dirty-guard 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
