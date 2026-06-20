# T-20260620-optimize-agent-output-yaml-to-reduce-tok - Optimize agent-output YAML to reduce token wastage

> backlog_id: R-224

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Optimize agent-output YAML to reduce token wastage

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Optimize agent-output YAML to reduce token wastage

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] API / 数据契约
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: ## 背景
- 目标: Optimize agent-output YAML to reduce token wastage
- 背景: 来自 backlog R-224
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: User approved the optimization proposal in /grill-me session

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-224 与任务 T-20260620-optimize-agent-output-yaml-to-reduce-tok 建立双向关联

## Journal Record

### 📝 任务摘要
已成功优化 docpath 状态输出 YAML，删除了静态契约与策略字段，移除了重复的 required_files/required_context/must_update 数组，统一以 context_refs 和 command_effects 结构体承载，并引入 sparse 属性，在未定义或空时剔除字段，显著缩减了 YAML 的 token 占用。同时升级了 continue, resume 和 runtime 以对接优化后的 context_refs。

### 🏗️ 架构决策
- 决策1: context_refs：以带有 meta 信息的结构体数组代替原先仅包含字符串的文件路径数组，提供更清晰的访问类型（index_only / read_if_needed）。

### 💡 经验教训
- 教训1: YAML 契约字段在多处使用，修改契约结构时应细致搜索全部可能消费该结构的代码，如 continue, resume 和 runtime 的 extractRequiredFiles 函数。

### 🔮 后续改进
- 改进1: 对 schema 进行校验，并在 CI/CD 中加入对 schema 和 test suite 覆盖率的验证。
