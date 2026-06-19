# T-20260619-fix-worktree-tracked-resource-contract-o - Fix worktree tracked-resource contract (option C: hybrid per-subtree tracking)

> backlog_id: R-211
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

09c6e0d 为消除 worktree 创建时 git 噪声，把被跟踪的 .docpath 资源改为副本，静默破坏了 backlog/rules 共享与 tasks 隔离契约；doctor 还把破坏判为 pass 掩盖问题。resolveSharedResource 等运行时重定向成死代码。

## 验收

1) backlog gitignore + symlink 真共享；2) rules 保留跟踪走合并中介并修文档；3) tasks/current gitignore 隔离、tasks/done 保留跟踪；4) doctor 对 shared/isolated 诊断诚实化（tracked copy 降级 warn）；5) 拆死代码；6) 更新 CLAUDE.md 与 worktree-workflow.md；7) tests/worktree.test.mjs 覆盖新契约。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix worktree tracked-resource contract (option C: hybrid per-subtree tracking)
  - 来源 backlog: R-211

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Fix worktree tracked-resource contract (option C: hybrid per-subtree tracking)

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: ## 背景
- 目标: Fix worktree tracked-resource contract (option C: hybrid per-subtree tracking)
- 背景: 来自 backlog R-211，Decision Brief 证据: docs/design/worktree-tracked-resource-contract-brief.md
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-06-19: 用户确认选项 C；backlog 不进 git 可接受；走完整 DocPath 流程

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-211 与任务 T-20260619-fix-worktree-tracked-resource-contract-o 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
