---
id: R-346
title: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
status: done
priority: P2
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: 机制定位：journal.ts:469 在 done 时只自动推进『已链接』条目（links.task 由 promote
    写入），quick 绕开 promote 故无 link——这是缝隙的成因，也指明解法。方案：矩阵为 proposed/accepted/planned
    开 done 捷径边（journal 直调 transitionBacklog 的路径不受影响）；校验统一收敛在 engine
    setBacklogStatus（新增 linkTask 选项：done 一律要求 links.task 非空；提供 --task 时验证
    tasks/<id>/或 tasks/done/<id>/ 存在 breadcrumb/spec/plan 之一，已链接值冲突
    fail-loud）。命令层仅透传，task.ts 只走 dropped 不受波及。现有测试 backlog.test.mjs:62 锁
    proposed→done 拒绝，须同步更新。
  spec: tasks/T-20260913-backlog-quick-done-active-promote-quick/spec.md
  decision_brief: >-
    - 当前问题: backlog 状态矩阵（engine/backlog.ts BACKLOG_TRANSITIONS）主干
    proposed→accepted→planned→active→done，其中 →active 唯一代码路径是
    promote（src/commands/backlog.ts:1100）。但 AGENTS.md 强制 <50 行修复走 docpath
    quick（绕过 promote）。两条规则交叉产生的缝隙：quick 闭环的 backlog 条目无法合法销账——accepted→done
    被拒（实测 R-333：Illegal transition，允许列表无 done），只剩 drop（语义失实：被拒项 ≠ 已完成项）。

    - 目标: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）

    - 背景: 来自 backlog R-346

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
  task: T-20260913-backlog-quick-done-active-promote-quick
  spec: tasks/T-20260913-backlog-quick-done-active-promote-quick/spec.md
created_at: 2026-09-12
---

## 背景

backlog 状态矩阵（engine/backlog.ts BACKLOG_TRANSITIONS）主干 proposed→accepted→planned→active→done，其中 →active 唯一代码路径是 promote（src/commands/backlog.ts:1100）。但 AGENTS.md 强制 <50 行修复走 docpath quick（绕过 promote）。两条规则交叉产生的缝隙：quick 闭环的 backlog 条目无法合法销账——accepted→done 被拒（实测 R-333：Illegal transition，允许列表无 done），只剩 drop（语义失实：被拒项 ≠ 已完成项）。

## 复现

1) backlog 条目 accepted；2) 对应修复经 docpath quick 完成并提交；3) docpath backlog done <id> → 报错，且无其它合法动作可达 done。

## 验收

1) 为"quick/旁路闭环"提供合法终态（如 accepted/planned → done 需附 links.task 非空校验，或新增 absorbed 状态）；2) done 前校验任务证据真实存在，防止借道逃避生命周期；3) 测试覆盖新旧转移路径；4) R-333（已 accepted 滞留）与历史同型条目可按新路径补录。
