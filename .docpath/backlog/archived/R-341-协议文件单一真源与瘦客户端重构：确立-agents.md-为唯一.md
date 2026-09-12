---
id: R-341
title: 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-341-analysis.md
  spec: tasks/T-20260912-agents-md-claude-codex/spec.md
  decision_brief: >-
    - 当前问题: 当前 docpath install --target universal 会在项目根目录同时生成
    AGENTS.md、CLAUDE.md、CODEX.md、OPENCODE.md 四个完整大文件（每个近 10KB），85%
    以上内容重复。导致根目录污染、多协议加载下的 Token 翻倍浪费、以及规则变动时的跨端维护漂移地狱。

    - 目标: 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理

    - 背景: 来自 backlog R-341

    - 可选方案:
      - 方案 A: 确立 AGENTS.md 为全局唯一完备协议真源，CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行）指向 @AGENTS.md，更新 install/render 校验与测试
      - 方案 B: 维持多端全量大文件，依赖 protocol blocks 注入同步
    - 推荐方案: 方案 A

    - 决策理由: 彻底消除多端协议内容重复与维护漂移，大幅节约上下文 Token，同时兼容各端 CLI 原生调用

    - 不做什么: 不废除 universal 目标，不改变 OpenCode 运行机制

    - 成本: 中等，按 plan 拆分后逐步验证

    - 风险: 旧版项目单独安装 claude 时需补齐 AGENTS.md 依赖（install 自动完成）

    - 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed

    - 用户确认: 用户显式要求「完成 R-341」并授权执行单一真源与瘦客户端重构方案
  user_confirmed: 用户显式要求「完成 R-341」并授权执行单一真源与瘦客户端重构方案
links:
  task: T-20260912-agents-md-claude-codex
  spec: tasks/T-20260912-agents-md-claude-codex/spec.md
created_at: 2026-09-12
---

## 背景

当前 docpath install --target universal 会在项目根目录同时生成 AGENTS.md、CLAUDE.md、CODEX.md、OPENCODE.md 四个完整大文件（每个近 10KB），85% 以上内容重复。导致根目录污染、多协议加载下的 Token 翻倍浪费、以及规则变动时的跨端维护漂移地狱。

## 验收

1. 确立 AGENTS.md 为全局唯一完备协议真源；2. CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行），仅保留专属命令映射并显式指向 @AGENTS.md；3. 重构 templates/protocols 模板与 docpath install / render 校验逻辑；4. 全量测试与 install manifest 检查保持通过。
