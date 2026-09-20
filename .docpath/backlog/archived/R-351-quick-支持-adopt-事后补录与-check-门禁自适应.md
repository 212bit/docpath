---
id: R-351
title: quick 支持 --adopt 事后补录与 check 门禁自适应配置
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260920-quick-adopt-check/spec.md
  decision_brief: >-
    - 当前问题: 解决在已产生 diff 时 quick 拒绝启动的死锁问题，以及 check 命令在 Rust/Makefile 项目中只跑 cargo
    check 的门禁空洞问题

    - 目标: quick 支持 --adopt 事后补录与 check 门禁自适应配置

    - 背景: 来自 backlog R-351

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 用户明确要求支持 quick 事后补录与 check 门禁自适应升级
  user_confirmed: 用户明确要求支持 quick 事后补录与 check 门禁自适应升级
links:
  task: T-20260920-quick-adopt-check
  spec: tasks/T-20260920-quick-adopt-check/spec.md
created_at: 2026-09-20
---

## 背景

解决在已产生 diff 时 quick 拒绝启动的死锁问题，以及 check 命令在 Rust/Makefile 项目中只跑 cargo check 的门禁空洞问题

## 验收

1. quick 支持 --adopt 认领已有小额变动；2. check 支持 config.yaml 配置与 Makefile 优先及 Rust 完整套件
