---
id: R-342
title: review 硬编码绝对路径规则对齐 console.log 测试豁免口径
status: done
priority: P2
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260912-review-console-log/spec.md
  decision_brief: >-
    - 当前问题: src/commands/review.ts:174-176 的硬编码绝对路径规则对所有文件零豁免发 error；其上方
    console.log 规则(167行)已对 test/src-commands 豁免且为 warn。review.ts:549 的
    approved=groups.errors.length===0 使 error 不论 current_diff/baseline 都阻塞
    review，进而卡死 review→check→journal。历史遗留的 /Users/... 测试字面量（baseline 范围）也会误伤。采用
    O1：镜像 console.log 豁免口径，测试/命令文件零产出，非测试文件保持 error 严格。

    - 目标: review 硬编码绝对路径规则对齐 console.log 测试豁免口径

    - 背景: 来自 backlog R-342

    - 可选方案:
      - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
      - 方案 B: 补充分析，扩展本任务范围
    - 推荐方案: 方案 A

    - 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险

    - 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 待确认
  user_confirmed: 待确认
links:
  task: T-20260912-review-console-log
  spec: tasks/T-20260912-review-console-log/spec.md
created_at: 2026-09-12
---

## 背景

src/commands/review.ts:174-176 的硬编码绝对路径规则对所有文件零豁免发 error；其上方 console.log 规则(167行)已对 test/src-commands 豁免且为 warn。review.ts:549 的 approved=groups.errors.length===0 使 error 不论 current_diff/baseline 都阻塞 review，进而卡死 review→check→journal。历史遗留的 /Users/... 测试字面量（baseline 范围）也会误伤。采用 O1：镜像 console.log 豁免口径，测试/命令文件零产出，非测试文件保持 error 严格。

## 验收

review.ts 硬编码路径规则对 test/src-commands 文件豁免（镜像 console.log 规则 167 行）；非测试文件仍发 error；tests/check-review.test.mjs:628 不受影响仍通过；node bin/docpath.js check 全绿。
