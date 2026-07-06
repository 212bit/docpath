# T-20260706-write-spec-stdin-1-agent - write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent

> backlog_id: R-248
> backlog_source: docpath backlog capture

## 1. 背景与动机

[来源: codex session 挖掘 @ evoucher 2026-07] 执行 `docpath write-spec --stdin < spec.md` 时，CLI 输出先打印 `✅ spec.md 已写入: .../spec.md`，紧接着打印 `❌ 未预期的错误`，退出码 1。文件实际已正确写入，但非零退出码让 codex agent 误判为失败并重试/回退。证据: ~/.codex/sessions/2026/07/06/rollout-2026-07-06T13-03-18-019f35cf-2f66-7fa3-a1c9-807dbe93dcb0.jsonl:632 及 :2304（同会话复现 2 次）。

- `src/commands/write-spec.ts:73-79`: 第 73 行 `writeActiveTaskFile` 写入成功，第 74 行打印成功日志；随后第 77 行 `transitionWorkflow(cwd, 'task.created', ...)` 或第 79 行 `nextCommand({ cwd })` 抛出异常。
- `src/index.ts:167-176`: 顶层 catch 捕获非 DocPathError 异常，统一打印 `❌ 未预期的错误` + `process.exit(1)`，覆盖了前面的成功信号。
- 根因: 成功路径里的后续步骤（状态转换 / next 命令计算）失败时，整条命令以退出码 1 结束，agent 据此判定 write-spec 失败，但文件已写入 → 状态与文件不一致，agent 重试会重复写入或回退。

## 2. 需求清单

### 功能需求
- [ ] FR-1: write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
  - 来源 backlog: R-248

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent

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
- 当前问题: ## 背景
- 目标: write-spec --stdin 成功写入后误报未预期错误，退出码 1 误导 agent
- 背景: 来自 backlog R-248
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

- [ ] AC-1: write-spec 在文件写入成功后，若后续状态转换/next 计算失败，不得以退出码 1 结束；应打印明确警告并退出 0（或独立的非致命退出码），保留成功信号。
- [ ] AC-2: 顶层 catch 对"成功后继步骤失败"应区分于"写入本身失败"，给出具体错误信息（哪个后续步骤、为什么），而非笼统的"未预期的错误"。
- [ ] AC-3: 回归: 构造一个 transitionWorkflow 会抛错的场景，确认 write-spec 退出码为 0 且 spec.md 已写入、日志含成功 + 警告两段。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-248 与任务 T-20260706-write-spec-stdin-1-agent 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
