# T-20260908-onboard-help-me-continue-debug-diff-gc-d - 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)

> backlog_id: R-315
> backlog_source: docpath backlog add

## 1. 背景与动机

依据 `.docpath/workspace/trace.jsonl` 全量 1460 条真实调用记录（2026-07~2026-08，其中 1249 条来自 claude agent、211 条 agent=unknown），下列命令在**两个 agent 分组中均为零命中**。

重要边界：trace 只记录经由 DocPath hook 插桩的会话调用。`init` / `doctor` / `commit` / `unlink` 这类人类入口命令虽同样零命中，但属采样盲区，**不在本次删除范围内**。本条目只删 Agent 面零使用且无内部耦合的命令。

命中数据（claude / unknown 两组合计）：

| 命令 | 调用次数 | 实现 LOC | 删除理由 |
| :--- | ---: | ---: | :--- |
| `onboard` | 0 | 399 | 交互式人类入门向导；Agent 侧完全由 `next --agent` 覆盖 |
| `help-me` | 0 | 15 | 状态相关帮助；同样被 `next --agent` 的 next_action + recommended_command 覆盖 |
| `continue` | 0 | 161 | "断线重连"设计假设 Agent 会话会中断；现代长上下文 Agent 不产生此需求 |
| `debug` | 0 | 109 | 系统化调试工作流（reproduce/isolate/hypothesize/verify/fix）；Agent 自主调试，不走命令编排 |
| `diff` | 0 | 122 | 步骤间差异查看，零使用 |
| `gc-decisions` | 0 | 39 | 决策月轮转；R-302 已落地 trace/breadcrumb 轮转归档，需先核实是否被其取代 |

合计约 845 LOC 实现代码，另需同步清理：命令注册（`register/core.ts` `register/execution.ts` `register/backlog-maintenance.ts`）、命令元数据（`register/command-metadata.ts`）、`templates/commands/` 下对应命令文档、协议载体中的命令清单、以及对应测试文件。

参照 R-301 已验证的"六维清理"范式（注册 / 实现 / 元数据 / 模板 / 测试 / 协议全链移除，并保留 fail-loud 断言）。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-315-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
  - 来源 backlog: R-315

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)

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
- 当前问题: 依据 `.docpath/workspace/trace.jsonl` 全量 1460 条真实调用记录（2026-07~2026-08，其中 1249 条来自 claude agent、211 条 agent=unknown），下列命令在**两个 agent 分组中均为零命中**。
- 目标: 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
- 背景: 来自 backlog R-315，Decision Brief 证据: ADR-20260908-002: 彻底移除 onboard/help-me/continue/debug/diff/gc-decisions 六个零使用命令
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户明确确认下线 R-315 所列 6 个零命中命令

### 已有 Decision Brief (来自 backlog evidence)

ADR-20260908-002: 彻底移除 onboard/help-me/continue/debug/diff/gc-decisions 六个零使用命令

## 5. 验收标准

- [ ] AC-1: [ ] `onboard` `help-me` `continue` `debug` `diff` 五个命令及其实现文件全链删除；执行时返回非零退出与明确提示
- [ ] AC-2: [ ] `gc-decisions` 先核实与 R-302 trace 轮转的关系：若已被取代则一并删除，若仍承担独立职责则保留并在本条目记录结论
- [ ] AC-3: [ ] 命令元数据条目数与文档清单同步下降，六维无残留引用
- [ ] AC-4: [ ] 对已删命令补 fail-loud 断言（调用即非零退出），防复辟
- [ ] AC-5: [ ] 全量测试与 typecheck 通过，零行为回归
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-315 与任务 T-20260908-onboard-help-me-continue-debug-diff-gc-d 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
