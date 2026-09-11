# T-20260911-docs-md-docs-index-legacy - 功能删除与瘦身：docs.md 下线/docs-index 瘦身/惰性配置删除/legacy 清理

> backlog_id: R-336
> backlog_source: docpath backlog add

## 1. 背景与动机

审计实证（R-335 后续）：1) docs.md 310KB 人类视图，程序侧唯一消费是 reveal 降级段与 docs list --full 的 cat，全部可从 docs-index.json 派生，另有 git-dirty-guard/changes-report 等四处特判为它存在；2) docs-index.json 1.15MB，867 条中 607 条为 archive（tasks/done+backlog/archived+legacy），content_terms 占 548KB（archive 387KB），topic 搜索对 archive 条目按 task-id/include-archive 走显式读取，全量摘要纯浪费；3) 惰性配置（grep 零消费方）：workflow.auto_brainstorm/auto_subagent/enforce_tdd/enforce_review、paths: 段、default_level（意外发现：level 实际来自 state.json）、project_commands；注意 project: 段（project-registry 消费）与 trace:（trace.ts 正则读取）是活的，保留；4) archive/docs-legacy-20260613.md 101KB + spec-legacy 模板集（6月归档，无引用）+ gc 扫出 11 棵已完成 worktree。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 功能删除与瘦身：docs.md 下线/docs-index 瘦身/惰性配置删除/legacy 清理
  - 来源 backlog: R-336

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 功能删除与瘦身：docs.md 下线/docs-index 瘦身/惰性配置删除/legacy 清理

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 审计实证（R-335 后续）：1) docs.md 310KB 人类视图，程序侧唯一消费是 reveal 降级段与 docs list --full 的 cat，全部可从 docs-index.json 派生，另有 git-dirty-guard/changes-report 等四处特判为它存在；2) docs-index.json 1.15MB，867 条中 607 条为 archive（tasks/done+backlog/archived+legacy），content_terms 占 548KB（archive 387KB），topic 搜索对 archive 条目按 task-id/include-archive 走显式读取，全量摘要纯浪费；3) 惰性配置（grep 零消费方）：workflow.auto_brainstorm/auto_subagent/enforce_tdd/enforce_review、paths: 段、default_level（意外发现：level 实际来自 state.json）、project_commands；注意 project: 段（project-registry 消费）与 trace:（trace.ts 正则读取）是活的，保留；4) archive/docs-legacy-20260613.md 101KB + spec-legacy 模板集（6月归档，无引用）+ gc 扫出 11 棵已完成 worktree。
- 目标: 功能删除与瘦身：docs.md 下线/docs-index 瘦身/惰性配置删除/legacy 清理
- 背景: 来自 backlog R-336
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 1) docs.md 不再生成/不再提交，docs list --full 从索引渲染同一张表，docs add 纯索引操作，reveal 兼容读取残留 docs.md；2) 索引 archive 条目不存 summary/content_terms，live 条目 content_terms 限 16 词，索引体积显著下降（1.15MB→约 600-700KB）；3) 惰性配置字段从类型与 init 写入点删除，用户 config 残留无行为影响（R-275 模式）；4) legacy 归档删除，merged_to_main=true 的 worktree prune（他会在制品树不动）；5) 全量套件全绿。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-336 与任务 T-20260911-docs-md-docs-index-legacy 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
