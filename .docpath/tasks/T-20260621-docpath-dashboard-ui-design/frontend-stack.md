---
kind: frontend-stack
status: draft
version: 1
required_sections:
  - 选定栈
  - 被否决备选
  - 约束
  - 待加载 skill
stack:
  js: null
  css: null
  components: null
rejected_count: 0
---

# Frontend Stack Decision

> Purpose: freeze the frontend technology stack BEFORE any UI prompt brief or
> design preview. The Framework Decision gate blocks `docpath go` for product-UI
> tasks until this document names a selected stack AND records at least one
> rejected alternative WITH a reason.
>
> 纯静态(无框架)是合法选定，但同样必须把"为什么不用框架"写成被否决备选；
> 该备选需要明确指向一个框架方案（如 React / Vue / Svelte / 使用框架）。
> 增量 UI 任务可写"沿用既定栈 X — 理由: 一致性"，被否决备选写
> "重写为其他栈 — 理由: 成本不划算"，门禁仍放行（不惩罚增量）。

## 选定栈

- JS 框架: React 19 + React Router v7
- CSS / 样式方案: Tailwind CSS v4
- 组件库 / 设计系统: lucide-react

## 被否决备选

- Next.js — 理由: 现有的 Vite 开发模式已足够满足 Dashboard SPA 场景，无需 SSR 支持，引入 Next.js 会增加构建与部署的维护成本。

## 约束

- 性能 / 包体约束: 生产环境打包后首屏核心 chunk 限制在 150KB (gzip) 以下。
- 兼容性约束 (浏览器 / 运行时): 兼容 Chrome/Firefox/Safari 近两个主流版本，支持最小视口 360px。
- 团队 / 维护约束: 全面支持 TypeScript 类型安全，与 DocPath CLI 的工具逻辑深度解耦。
- 与既有代码的一致性约束: 沿用 dashboard-dist 已有的全局 CSS 变量作为 Token。

## 待加载 skill

- 选定栈对应 skill: 「加载 React 19 + Tailwind CSS 极客暗色设计规范 Skill」
