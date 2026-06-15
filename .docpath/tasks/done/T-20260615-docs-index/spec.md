# T-20260615-docs-index - docs-index 归档策略 — 物理移除旧条目

> backlog_id: R-179
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

当前 docs-index.json 约 462KB/16392 行，docs.md 约 144KB。现有 docs scan 只把 180 天前的 archive 条目标记 stale，context/reveal 并不消费 stale 字段，因此旧归档条目继续占用 docs-index 体积。scan 已部分排除 workspace/commands、workspace/bin、workspace/leases、workspace/sessions，但仍需要测试锁定。INDEX.md 已声明为唯一入口并废弃 docs.md，而 docs scan 仍生成 docs.md 兼容视图，导致双索引继续增长。

## 验收

1. docs scan 物理排除超过 180 天的 archive 条目，不再写入 docs-index.json 和 docs.md。2. 显式 --task-id 查询被物理移除的旧任务时必须 fail-loud 并提示归档已超出 docs-index 保留窗口，而不是误导为索引损坏。3. scan 排除 workspace/commands、workspace/bin、workspace/leases、workspace/sessions 等运行态目录，并有测试覆盖。4. INDEX.md 顶部继续声明唯一入口，docs.md 只作为兼容生成视图或停止生成的决策需在 Decision Brief 中确认。5. docs-index.json 重新 scan 后小于 200KB。6. 测试覆盖旧 archive 物理移除、未过期 archive 保留、运行态目录排除、context/reveal 对被移除 task-id 的错误信息。

## 2. 需求清单

### 功能需求
- [ ] FR-1: docs-index 归档策略 — 物理移除旧条目
  - 来源 backlog: R-179

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- docs-index 归档策略 — 物理移除旧条目

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题:
- 目标:
- 背景:
- 可选方案:
- 推荐方案:
- 不做什么:
- 成本:
- 风险:
- 回滚方案:
- 用户确认:

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-179 与任务 T-20260615-docs-index 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
