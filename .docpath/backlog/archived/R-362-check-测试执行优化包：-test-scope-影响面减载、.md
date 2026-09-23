---
id: R-362
title: check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/R362-analysis.md
  spec: tasks/T-20260923-check-test-scope-quick-guard-porcelain-b/spec.md
  decision_brief: >-
    - 当前问题: check 全量测试约占耗时97%（实测80s），主要来自 node --test 87文件857用例。提供
    --test-scope=touched 影响面减载（叶子改动省82%）与 --test-scope=full 受控并发+进程隔离；修复
    quick-guard readChangedFiles 对 tracked 文件 porcelain 输出 slice(3) 路径错切的核心漏判
    bug。

    - 目标: check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径
    bug 修复

    - 背景: 来自 backlog R-362

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
  task: T-20260923-check-test-scope-quick-guard-porcelain-b
  spec: tasks/T-20260923-check-test-scope-quick-guard-porcelain-b/spec.md
created_at: 2026-09-23
---

## 背景

check 全量测试约占耗时97%（实测80s），主要来自 node --test 87文件857用例。提供 --test-scope=touched 影响面减载（叶子改动省82%）与 --test-scope=full 受控并发+进程隔离；修复 quick-guard readChangedFiles 对 tracked 文件 porcelain 输出 slice(3) 路径错切的核心漏判 bug。

## 验收

AC-1: --test-scope=touched 仅运行与 git 改动相关的测试子集，叶子改动（改单个非核心源文件）实测减载不低于 80%；AC-2: touched 触及 RISKY_PATH_PATTERNS（命令主文件、check/worktree 子模块、engine、核心 utils、package.json、锁文件、tsconfig）时强制回落全量，不漏测核心；AC-3: --test-scope=full（默认）注入受控并发 --test-concurrency（cpu/2，范围 2 到 8）与 --test-isolation=process，全量覆盖不筛选；AC-4: quick-guard readChangedFiles 对 tracked 修改（状态码前导空格的 M src/...）用 line.slice(3) 正确取路径，核心路径不致被错切为 rc/... 而漏判；AC-5: 受控并发加进程隔离消除全并发摊薄与 ~/.docpath/projects.sqlite 竞态重试，整体 check 墙钟显著下降（基线约 80s）；AC-6: 上述行为均有回归测试覆盖。
