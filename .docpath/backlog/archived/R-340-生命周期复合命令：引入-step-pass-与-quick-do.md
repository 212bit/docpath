---
id: R-340
title: 生命周期复合命令：引入 step-pass 与 quick-done 减少 Agent 工具调用往返
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260912-step-pass-quick-done-agent/spec.md
  decision_brief: >-
    - 当前问题: 当前 Agent 执行每一步需要 step done + go next 两次往返；quick 任务收尾需要 check + done
    多次交互。引入复合命令可将往返次数减少 50% 以上。

    - 目标: 生命周期复合命令：引入 step-pass 与 quick-done 减少 Agent 工具调用往返

    - 背景: 来自 backlog R-340

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 已确认（2026-09-12 会话 session-0846aa62：用户指定新开 worktree 并行实施 R-340，方案 A
    保持 backlog 范围；复合命令仅为语义包装，go/agent/check 门禁全部复用不削弱）
  user_confirmed: 已确认（2026-09-12 会话 session-0846aa62：用户指定新开 worktree 并行实施 R-340，方案
    A 保持 backlog 范围；复合命令仅为语义包装，go/agent/check 门禁全部复用不削弱）
links:
  task: T-20260912-step-pass-quick-done-agent
  spec: tasks/T-20260912-step-pass-quick-done-agent/spec.md
created_at: 2026-09-12
---

## 背景

当前 Agent 执行每一步需要 step done + go next 两次往返；quick 任务收尾需要 check + done 多次交互。引入复合命令可将往返次数减少 50% 以上。

## 验收

支持 docpath step-pass 自动完成当前步骤并启动下一步；支持 quick-done 一键执行 check 与准备提交。
