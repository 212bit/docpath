# 需求：DocPath 需求管理 / Backlog 层 (R-010)

> Source: dogfooding 发现 (2026-05-30)。本文件作为 `docpath brainstorm` 的输入。

## 背景 / 问题

DocPath 当前只有「单任务生命周期」的纵向流程：
brainstorm → spec → plan → go → check → review → journal → done，
状态机只认 `.docpath/tasks/current/` 一个活跃槽位。

它缺少「横向」的**需求管理/backlog 层**：无法回答「我们有哪些待办需求、各自状态/优先级、下一个该拉哪一个」。
后果：所有候选工作被迫堆进散文文档（如 `docs/design/next-phase-tasks.md`），
该文档已膨胀到 600+ 行，把『路线图散文 / backlog 条目 / 每条细节 / 进度日志』四类内容混在一起，
对 AI 和人都不友好；`next` 在 idle 时也只能说「brainstorm 一个新的」，没有可消费的待办池。

## 目标

为 DocPath 增加一个可持续、机器可读、人可扫的 backlog 层，使：
- 多个需求条目以「一条一文件 + 索引」的形式存在，不再堆进单一散文文档；
- 每条有独立的轻量状态机（proposed→accepted→planned→active→done|dropped）、优先级、level；
- `next --agent` 在空闲时从 backlog 给出「下一个该拉哪条」的路由；
- 一条 backlog 条目可被「promote」成 `tasks/current/` 的活跃任务，完成后回填为 done；
- 散文设计文档回归散文（只留动机/方案），用 `R-###` 链接 backlog，不再内嵌活动状态。

## 倾向方案（A：一条一文件 + 索引）

```
.docpath/backlog/
  R-001-xxx.md        # frontmatter: id/title/status/priority/level/source/links
  R-010-xxx.md
  backlog.md          # 生成的索引: id | title | status | priority | level
```
条目 frontmatter 示例：
```yaml
id: R-010
title: 需求管理 / backlog 层
status: proposed
priority: P1
level: 2
source: dogfooding-2026-05-30
links: { task: null, spec: null }
```

命令草案：`docpath backlog capture|add|edit|list [--status][--priority]|groom|promote <id>|done <id>`。
`capture` 用于 raw idea 捕获；`add` 用于已有背景和验收的 shaped 条目；level 2/3 条目进入 accept/promote 前需要 readiness/evidence 证据。

## 集成点（与现有工作流的接缝）

- `next --agent`（idle 时）：从 backlog 推荐「promote 最高优先级 accepted 条目」或「groom backlog」。
- `promote <id>`：用条目内容 seed `tasks/current/`（spec 雏形），条目转 active；走既有 brainstorm/plan/go。
- `journal`/`agent done` 完成任务时：把关联 backlog 条目回填为 done，并在正文仍为空或占位时从 linked spec 回填摘要和 evidence。
- 迁移：`next-phase-tasks.md` §11/§12 的 P/G/D 条目逐步抽成 backlog 条目，散文只留动机+链接。

## 开放问题（需在 spec 中定夺）

1. backlog 条目与 task 是否 1:1？promote 是「重命名/搬移」还是「派生」（一条需求可拆多个 task）？
2. id 方案：`R-###`（需求域）还是复用 `T-YYYYMMDD`（任务域）？两者如何关联？
3. 索引 `backlog.md` 是否复用现有 `docs scan` 的扫描/索引机制，还是独立实现？
4. 迁移既有 §11/§12 条目：手工一次性迁移，还是提供 `backlog import` 辅助？
5. backlog 条目状态机是否纳入统一的 `transitionWorkflow`，还是独立的小状态机（它与执行 FSM 不同维度）？

## 粗略验收

- 能 `add` 一条需求 → 出现在 `backlog list` 与索引中；
- `next --agent` 空闲时推荐从 backlog 拉条目，而非「brainstorm 空启动」；
- `promote <id>` 后 `tasks/current/` 就绪、条目转 active；任务完成后条目自动转 done；
- 新增/变更条目后索引可机器稳定解析；单一散文文档不再承担状态/进度。
