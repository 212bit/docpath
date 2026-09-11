---
id: R-337
title: 工作流/Review/架构优化包 1+2：漂移自愈提示/恢复指引/CLI 旗标/skill gate 干净跳过/消息纠偏 + git
  共享原语/收尾路径收敛/worktree 拆分
status: proposed
priority: P1
level: 2
source: docpath backlog add
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

三天 dogfooding 实测摩擦 + 结构审计：W1 spec 双真源漂移提示刷屏（next --agent 每次重复可自愈提示）；W2 plan 漂移锁恢复笨重（plan 预勾触发 drift_lock 拒 go，恢复要 write-plan 重写；agent step 在 planning 报非法转移无指路）；R1 review 缺 --non-interactive（check 有，实测 Unknown option）；R2 skill gate 盖章仪式（current_diff 0错0警仍要手工 write-review-skill 盖 boilerplate，实测 2 次）；R3 review 消息误导（❌ 需要修改 0错13警，真实阻塞是 skill gate，13 警全是 baseline 不阻塞）；A1 git 调用无共享原语（12+ 文件各自 execFileSync('git')，quotePath=false 仅 4 处，8+ 处带 CJK quoting bug 类）；A2 worktree.ts 1333 行巨石；W3 步骤收尾三条平行路径（go --status/agent step/run end 各写 breadcrumb+plan sync）。

## 验收

包1：W1 漂移提示同 sha 去重不刷屏；W2 drift_lock 消息按漂移类型给直接修复命令，agent step planning 报错指路 go；R1 review 支持 --non-interactive；R2 current_diff 0错0警时 skill gate 自动 pass_with_skips（记录原因）；R3 review 消息区分 baseline 警告并点名真实阻塞原因。包2：A1 新建 utils/git-run.ts 共享原语（quotePath=false+timeout+capture），12 文件迁移；A2 worktree.ts 拆分为 commands/worktree/ 子目录（行为不变）；W3 go --status 与 agent step 收尾共用 runtime end 原语。全量测试绿。
