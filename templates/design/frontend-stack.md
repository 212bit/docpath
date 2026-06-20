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
> 纯静态(无框架)是合法选定，但同样必须把"为什么不用框架"写成被否决备选。
> 增量 UI 任务可写"沿用既定栈 X — 理由: 一致性"，被否决备选写
> "重写为其他栈 — 理由: 成本不划算"，门禁仍放行（不惩罚增量）。

## 选定栈

- JS 框架: <选定框架 | 纯静态>
- CSS / 样式方案: <选定方案>
- 组件库 / 设计系统: <选定 | 无>

## 被否决备选

> 至少 1 条，每条必须带「理由:」。门禁逼出"为什么不选别的"，
> 防止"填了框架名就放行"。

- <被否决方案> — 理由: <为什么不选它>

## 约束

- 性能 / 包体约束:
- 兼容性约束 (浏览器 / 运行时):
- 团队 / 维护约束:
- 与既有代码的一致性约束:

## 待加载 skill

> 本仓库不内置框架专属 skill。此处只记录"选定栈对应应加载哪个 skill"，
> 由当前 agent 会话按需去加载（决策记录 + 加载提示，不内置）。

- 选定栈对应 skill: <skill 名 / 加载提示，如「加载 react + tailwind 设计 skill」>
