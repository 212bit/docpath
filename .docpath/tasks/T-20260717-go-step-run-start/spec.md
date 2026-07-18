# T-20260717-go-step-run-start - go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行

> backlog_id: R-283
> backlog_source: docpath backlog capture

## 1. 背景与动机

R-275/R-276 S3 认领两次被 dirty guard 拒 (本任务实现未提交是执行期常态), 只能走 docpath run start 恢复归属。我们需要对'当前任务的顺序下一步'认领放行本任务范围内脏文件。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-283-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
  - 来源 backlog: R-283

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行

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
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行
- 背景: 来自 backlog R-283
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 当且仅当在当前活跃任务的执行期（phase=executing）认领该任务的子步骤时，dirty guard 放行该任务范围内的脏文件。 * 在 worktree 模式下，放行工作区所有脏文件（含 untracked 文件，因为 worktree 本身是物理隔离的）。 * 在非 worktree 模式下，放行 tracked 脏文件，对不属于 task canonical 路径 of untracked 文件仍维持拦截，以防混入无关文件。 * 新启动任务或跨任务场景下（目标任务与当前活跃任务不一致，或当前无活跃任务），依然严格拦截所有脏文件。 * 补充对应单元测试验证上述行为。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-283 与任务 T-20260717-go-step-run-start 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
