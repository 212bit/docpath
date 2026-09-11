---
id: R-332
title: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
status: proposed
priority: P3
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
created_at: 2026-09-11
---

## 背景

本机 PATH 的 docpath 为全局旧安装（~/.npm-global），本仓库开发必须 node bin/docpath.js；开发者在仓库目录误用全局旧版时无任何提示，新功能验证易踩旧行为。方向：(a) bin 入口（仓库 checkout 内启动时）检测 PATH docpath 版本差并在 doctor/next 输出提示；(b) 或提供 npm link/落 shim 的引导；(c) 文档明示双轨事实。

## 验收

1) 在仓库 checkout 目录能以显式信号（doctor/next 提示或文档）感知版本漂移与正确调用方式；2) 对正常全局安装用户零额外噪音。
