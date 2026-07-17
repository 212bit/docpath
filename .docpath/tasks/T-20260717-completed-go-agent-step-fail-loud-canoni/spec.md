# T-20260717-completed-go-agent-step-fail-loud-canoni - completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb

> backlog_id: R-280
> backlog_source: docpath backlog capture

## 1. 背景与动机

本会话两次实证: promote 失败被管道吞掉后 && 链继续, go --step S1 在 state=completed 的任务上执行, 向已归档证据 canonical breadcrumb.jsonl 追加伪事件 (13:53 S1 无 start 配对), 脏文件再反过来挡 promote, 需 git checkout 恢复。completed/archived 任务的 go 与 agent step 应直接非零退出+零写入, 错误信息引导 docpath next / backlog promote。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-280-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
  - 来源 backlog: R-280

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb

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
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: completed 任务上 go/agent step 应 fail-loud 拒绝, 而非半执行污染 canonical breadcrumb
- 背景: 来自 backlog R-280
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 已由用户指示推进该 backlog 任务 (2026-07-17)

## 5. 验收标准

- [ ] AC-1: 当任务已处于 completed 状态时，执行 `docpath go` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。
- [ ] AC-2: 当任务已处于 completed 状态时，执行 `docpath agent step` 应以非零状态码（fail-loud）退出，报错信息包含引导说明，且没有任何写入或状态更新。
- [ ] AC-3: 全套测试通过且新增针对 completed 任务拒绝推进的单元/端到端测试用例。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-280 与任务 T-20260717-completed-go-agent-step-fail-loud-canoni 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
