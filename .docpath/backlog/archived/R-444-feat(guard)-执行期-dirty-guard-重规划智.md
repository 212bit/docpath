---
id: R-444
title: "feat(guard): 执行期 Dirty Guard 重规划智能自愈与同任务变更自动放行"
kind: feature
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-feat-guard-dirty-guard/spec.md
  decision_brief: >-
    - 当前问题: 在任务执行中途使用 `docpath plan --force` 或 `docpath write-plan` 修正计划后，状态回到
    `planning` 阶段。

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
  user_confirmed: 待确认
links:
  task: T-20260929-feat-guard-dirty-guard
  spec: tasks/T-20260929-feat-guard-dirty-guard/spec.md
created_at: 2026-09-29
---

## 背景

在任务执行中途使用 `docpath plan --force` 或 `docpath write-plan` 修正计划后，状态回到 `planning` 阶段。
此时再次运行 `docpath go --step S1`，`assertNoNonDocPathChangesForExecutionStart` 会由于当前 phase 为 `planning`（不在 `ACTIVE_TASK_PHASES` 中）而将该任务此前步骤自己产生的工作区 tracked 变更误判为外部 dirty 变更并强制拦截，强迫用户手动传递 `--accept-dirty`。

## 功能需求

- [ ] FR-1: 在 `git-dirty-guard.ts` 中增强活跃任务判定，当 phase 为 `planning` 但当前 `state.task_id` 匹配且已存在执行事件（如 breadcrumb 中已发生过 `step.started`），或为同一任务的重规划重入时，判定为活跃任务。
- [ ] FR-2: 处于活跃任务期内的同任务 tracked 变更（非未跟踪的新增噪音文件）自动放行，不再强制拦截要求 `--accept-dirty`。
- [ ] FR-3: 补充单元测试验证重规划场景下 `docpath go` 的放行行为，并通过质量门禁。

## 验收

- [ ] 同任务在执行中途重规划回到 `planning` 状态后，`docpath go --step <step>` 对本任务已跟踪修改自动放行
- [ ] 未开工的全新任务在 `planning` 状态下如果有外部 dirty 变更，仍严格拦截防污染
- [ ] 补充对应的单元测试并通过质量门禁
