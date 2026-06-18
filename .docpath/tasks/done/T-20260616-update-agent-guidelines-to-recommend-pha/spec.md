# T-20260616-update-agent-guidelines-to-recommend-pha - Update agent guidelines to recommend Phase 1 operational commands

> backlog_id: R-189
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

Phase 1 operational commands (start/step/done/recover/retry/unblock) have been implemented and tested. These commands provide better DX by offering shorter, more semantic alternatives to low-level commands. However, current agent guidelines (CLAUDE.md, .docpath/rules/AGENTS.md) still reference the old command patterns. We need to update these guidelines to recommend the new operational commands as the primary path while keeping low-level commands documented for advanced use.

## 验收

Updated CLAUDE.md to recommend new operational commands; Updated .docpath/rules/AGENTS.md with new command patterns; Low-level commands remain documented as advanced/diagnostic options; All example workflows use new commands

## 2. 需求清单

### 功能需求
- [ ] FR-1: Update agent guidelines to recommend Phase 1 operational commands
  - 来源 backlog: R-189

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Update agent guidelines to recommend Phase 1 operational commands

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
- [ ] AC-2: backlog 条目 R-189 与任务 T-20260616-update-agent-guidelines-to-recommend-pha 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
