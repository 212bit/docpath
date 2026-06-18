# T-20260531-stale-pending-done-24h - 统一 stale pending-done 的 24h 告警入口

> backlog_id: R-025
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档 `docs/design/next-phase-tasks.md` 在 `§11.2 G1` 明确要求：当 `pending-done.md` 超过 24 小时未清理时，应自动向 breadcrumb 追加 `[WARN] Task active >24h without done`。  

当前实现里，24 小时 stale 检测只挂在 `generateAgentOutput()`，也就是 `docpath next --agent` 路径会触发该 warning 副作用；普通 `docpath status` 仅输出存在哨兵的提示，不会触发同一条超时 warning。这意味着：

- 同一个生命周期规则在不同入口上的行为不一致；
- 用户如果只运行 `status` 观察状态，不会得到设计要求的 stale breadcrumb 证据；
- stale 哨兵副作用逻辑分散在 agent 输出层，不利于后续复用与测试。

本任务聚焦把 stale `pending-done` 的 24h 告警整理成统一能力，由 `status` 和 `next --agent` 共享，保证 warning breadcrumb 的追加语义一致且幂等。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 提供统一的 stale `pending-done` 检测与告警入口，识别当前 executing 任务的哨兵是否已超过 24 小时。
- [ ] FR-2: `docpath status` 在命中 stale 哨兵时，除现有未收尾提示外，还需触发与 `next --agent` 一致的 breadcrumb warning 记录。
- [ ] FR-3: `docpath next --agent` 继续保留现有 stale warning 行为，但改为复用统一逻辑，避免重复实现。
- [ ] FR-4: warning breadcrumb 必须保持幂等，同一 stale 哨兵不会因多次执行 `status` 或 `next --agent` 重复追加。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改变正常 `pending-done` 提醒路由和 `recommended_command: docpath agent done` 行为。
- [ ] NFR-3: stale 检测仅对“当前 executing 任务且哨兵 task_id 匹配”的场景生效，不扩大误报范围。

## 3. 范围界定

### 包含
- stale `pending-done` 告警逻辑抽取与复用
- `status` 路径下的 24h warning breadcrumb 触发
- `next --agent` 路径回归验证
- 相关测试与回归

### 不包含
- 改写 `pending-done.md` 数据格式
- 调整 `agent done` 的清理策略
- 引入新的超时阈值配置项

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | stale warning 触发点 | 仅 next --agent / 抽共享逻辑供 status + next 共用 | 抽共享逻辑 | 避免生命周期副作用按入口漂移 |
| 3 | 幂等策略 | 每次都写 breadcrumb / 依赖 warned 标记只写一次 | 依赖 warned 标记 | 与当前哨兵格式兼容，避免重复污染 breadcrumb |

## 5. 验收标准

- [ ] AC-1: stale 哨兵场景下，`status` 与 `next --agent` 都能触发同一条 24h warning breadcrumb，且只追加一次。
- [ ] AC-2: 非 stale、task_id 不匹配或非 executing 场景不会误写 warning breadcrumb。
- [ ] AC-3: `next --agent` 原有的 `docpath agent done` 推荐行为不回归。
- [ ] AC-4: 相关测试覆盖 `status` 触发、`next --agent` 触发和幂等场景，并通过串行回归验证。

---

*此文件由 `docpath backlog promote` 生成。*
