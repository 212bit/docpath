---
id: R-346
title: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
status: proposed
priority: P2
level: 2
source: docpath backlog capture
readiness: raw
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-12
---

## 背景

backlog 状态矩阵（engine/backlog.ts BACKLOG_TRANSITIONS）主干 proposed→accepted→planned→active→done，其中 →active 唯一代码路径是 promote（src/commands/backlog.ts:1100）。但 AGENTS.md 强制 <50 行修复走 docpath quick（绕过 promote）。两条规则交叉产生的缝隙：quick 闭环的 backlog 条目无法合法销账——accepted→done 被拒（实测 R-333：Illegal transition，允许列表无 done），只剩 drop（语义失实：被拒项 ≠ 已完成项）。

## 复现

1) backlog 条目 accepted；2) 对应修复经 docpath quick 完成并提交；3) docpath backlog done <id> → 报错，且无其它合法动作可达 done。

## 验收

1) 为"quick/旁路闭环"提供合法终态（如 accepted/planned → done 需附 links.task 非空校验，或新增 absorbed 状态）；2) done 前校验任务证据真实存在，防止借道逃避生命周期；3) 测试覆盖新旧转移路径；4) R-333（已 accepted 滞留）与历史同型条目可按新路径补录。
