---
id: R-364
title: next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260923-next-executing-agent-enter-go-step/spec.md
  decision_brief: >-
    - 当前问题: `next` / `next_hint` 在「phase=executing 且 plan 有未完成步骤」时推荐 `docpath
    agent enter`，但 `agent enter` 的定位是**一次性会话入口**（`src/commands/agent.ts:5-6`：「加载
    state.json 标记执行开始」），不是可反复执行的「下一步」。

    - 目标: next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）

    - 背景: 来自 backlog R-364

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
  task: T-20260923-next-executing-agent-enter-go-step
  spec: tasks/T-20260923-next-executing-agent-enter-go-step/spec.md
created_at: 2026-09-23
---

## 背景

`next` / `next_hint` 在「phase=executing 且 plan 有未完成步骤」时推荐 `docpath agent enter`，但 `agent enter` 的定位是**一次性会话入口**（`src/commands/agent.ts:5-6`：「加载 state.json 标记执行开始」），不是可反复执行的「下一步」。

复现（2026-09-23，隔离 git 工作区，phase=executing + plan 两个未完成步骤）：

```
$ docpath next --agent
next_action: 开始或恢复任务执行，运行 agent enter 初始化会话
recommended_command: docpath agent enter
exit_criteria: 已运行 docpath agent enter 并生成 pending-done 哨兵

$ docpath agent enter
...
next_hint:
  next_action: "执行下一个未完成步骤: S1 todo（检测到 pending-done 哨兵，完成当前步骤后再收尾）"
  recommended_command: docpath go --step S1
```

矛盾有三：

1. **路由不可稳定复现**：`agent enter` 的 `exit_criteria` 是「已生成 pending-done 哨兵」；一旦哨兵生成，`next` 就跳到 pending-done 分支、不再推荐 enter。即该推荐最多只该出现一次，却以「下一步」的形式常驻。
2. **推荐的不是真正要执行的动作**：真正推进任务的是 `docpath go --step <id>`。`agent enter` 只是会话初始化，执行后仍需再走 go——用户多一次往返。
3. **代码自身自相矛盾**：`src/commands/agent.ts:231` 的报错文案写「正常路径: 先运行上方 recommended_command，**通常是 `docpath go --step <id>`**」，而该分支实际推荐的是 `agent enter`。

## 验收

1. `phase=executing` 且 plan 存在未完成步骤时，`next` / `next_hint` 的 `recommended_command` 为 `docpath go --step <下一个未完成步骤 id>`，不再是 `docpath agent enter`；
2. `docpath agent enter` 命令本身保留（仍作为会话入口：加载状态、生成 context-index、写 pending-done 哨兵），只是不再作为 `next` 的常规下一步推荐；
3. 无 plan / 无法解析未完成步骤时仍给出可操作降级（不得退化为推荐一个不可执行的命令）；
4. quick profile / troubleshooting / 有 pending-done 哨兵等既有分支语义不变；
5. 回归测试覆盖：executing + 未完成步骤 → 推荐 `go --step <id>`；并确认既有 `agent enter` 相关测试（agent-lifecycle / major-change-gate / payload-context-index）不受影响。
