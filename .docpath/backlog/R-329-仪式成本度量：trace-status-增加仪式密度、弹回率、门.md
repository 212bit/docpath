---
id: R-329
title: 仪式成本度量：trace/status 增加仪式密度、弹回率、门禁时延占比三指标
status: proposed
priority: P2
level: 1
source: docpath backlog capture
readiness: shaped
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: null
links:
  task: null
  spec: null
created_at: 2026-09-11
---

## 背景

动机：模型持续变强，DocPath 的必要性需用数据自证——仪式/工作比率应随模型升级而下降，先建立基线才能验证。数据基线（2026-09-11 统计 tasks/done/ 120 份 breadcrumb.jsonl）：quick 任务事件数中位 3、标准任务中位 11、blocked 中位 1；最差任务 20 事件含 8 次 blocked（40% 弹回率），说明痛点在门禁弹回而非步骤数量。三指标定义：1) 仪式密度=任务 breadcrumb 事件数÷最终 diff 触及文件数；2) 弹回率=blocked 事件数÷总事件数；3) 门禁时延占比=check/review 等门禁命令耗时÷任务总墙钟时间。落点：docpath trace 或 status --agent 增加 ceremony 段；纯只读观测，无行为变更；数据可喂给 T-20260911 工作流可视化任务。长期意义：每次模型换代用同类任务对比仪式密度，作为 DocPath 存续判据。

## 验收

1. trace 或 status --agent 输出单任务三指标（仪式密度/弹回率/门禁时延占比）；2. 支持跨任务聚合（按 quick/标准 档位分组的中位数统计）；3. 数据源仅用现有 breadcrumb.jsonl 与 git diff，不引入新状态文件；4. 纯只读观测，不改变任何门禁或工作流行为。
