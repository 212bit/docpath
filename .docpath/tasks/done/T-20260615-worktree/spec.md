# T-20260615-worktree - Worktree 真并发开发支持 — 基础设施

> backlog_id: R-183
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

当前 DocPath 只支持单任务或 session 串行接力，阻碍真并发开发。需要实现 Git Worktree + 独立 .docpath/ 架构，支持 Codex/Claude Code 同时开发不同 feature。核心需求：物理隔离（零冲突）、共享 backlog/rules、标准 Git workflow、2 周可交付。

## 验收

R-190: docpath worktree create/list/remove 命令实现，R-191: symlink 策略（共享 backlog/rules，隔离 workspace/tasks），验收：两个 worktree 同时运行 docpath next/status 无冲突，测试覆盖基础设施，文档说明使用方式，工作量 Week 1: 3-5 天

## 2. 需求清单

### 功能需求
- [ ] FR-1: Worktree 真并发开发支持 — 基础设施
  - 来源 backlog: R-183

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Worktree 真并发开发支持 — 基础设施

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
- [ ] AC-2: backlog 条目 R-183 与任务 T-20260615-worktree 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
