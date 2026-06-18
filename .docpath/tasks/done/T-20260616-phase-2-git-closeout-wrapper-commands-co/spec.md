# T-20260616-phase-2-git-closeout-wrapper-commands-co - Phase 2: Git closeout wrapper commands (commit/stage)

> backlog_id: R-190
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

Phase 1 operational commands successfully simplified the lifecycle workflow. However, the git closeout step still requires manual staging and committing. After docpath done completes all gates (check/review/journal), agents must manually interpret changes --agent output, stage files with git add, and commit with proper message format and co-author trailer. This is error-prone and breaks the simplified workflow pattern established in Phase 1.

## 验收

docpath commit --dry-run shows preview; docpath commit --stage stages recommended files; docpath commit -m creates commit with auto co-author; All safety checks implemented (detached HEAD, conflicts, untracked files); Comprehensive test coverage; Phase 1 commands unaffected; Manual git workflow preserved

## 2. 需求清单

### 功能需求
- [ ] FR-1: Phase 2: Git closeout wrapper commands (commit/stage)
  - 来源 backlog: R-190

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Phase 2: Git closeout wrapper commands (commit/stage)

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
- [ ] AC-2: backlog 条目 R-190 与任务 T-20260616-phase-2-git-closeout-wrapper-commands-co 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
