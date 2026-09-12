---
id: R-341
title: 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理
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
created_at: 2026-09-12
---

## 背景

当前 docpath install --target universal 会在项目根目录同时生成 AGENTS.md、CLAUDE.md、CODEX.md、OPENCODE.md 四个完整大文件（每个近 10KB），85% 以上内容重复。导致根目录污染、多协议加载下的 Token 翻倍浪费、以及规则变动时的跨端维护漂移地狱。

## 验收

1. 确立 AGENTS.md 为全局唯一完备协议真源；2. CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行），仅保留专属命令映射并显式指向 @AGENTS.md；3. 重构 templates/protocols 模板与 docpath install / render 校验逻辑；4. 全量测试与 install manifest 检查保持通过。
