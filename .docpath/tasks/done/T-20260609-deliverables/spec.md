# T-20260609-deliverables - 增加业务交付物模板库与 deliverables 索引

> backlog_id: R-144
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景
ExpertTeam-Codex 的优势在于产物模板明确，例如 PRD、竞品分析、路线图、设计审查、QA 报告，并要求落盘到 deliverables 目录。R-146 Fit Assessment 建议 R-144 在 R-143 之后推进：先定义专家角色和业务交付物如何落盘、索引和被检查，避免后续 R-142 的角色产出只停留在聊天中。

## 目标
为 DocPath 增加轻量业务交付物模板库与 deliverables 索引，使状态机不仅记录过程，也能稳定产出产品、设计、工程和 QA 报告，并让生成产物能被任务证据链和 Hybrid Context Index 感知。

## 范围
- 标准目录：deliverables/product-strategy、deliverables/design、deliverables/engineering、deliverables/qa。
- MVP 模板：prd、competitive-analysis、architecture-brief、prototype-review、qa-report、stakeholder-update。
- 任务目录记录 deliverables index，包含 task_id、模板类型、输出路径、状态、来源和更新时间。
- 生成产物被 task evidence/deliverables index 追踪，并可作为 R-143 Hybrid Context Index 的 leaves。
- status/review 可展示或校验关键产物路径与必填章节。
- 模板必须包含 TL;DR、核心结论、行动项、Non-goals/Assumptions、证据来源。

## 不包含
- 不做大型模板 CMS。
- 不实现 R-142 的角色注册表或自动专家团编排。
- 不绑定 Codex Skill 入口；R-145 后续只作为平台适配。

## 验收
- 新增命令或等价入口可 list/render 模板，并可写入指定 deliverables 路径。
- 生成产物被 task evidence/deliverables index 追踪。
- check/review 能提示缺失的必填章节。
- 有快照或结构测试覆盖核心模板、索引写入和缺失章节校验。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 增加业务交付物模板库与 deliverables 索引
  - 来源 backlog: R-144

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 增加业务交付物模板库与 deliverables 索引

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
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: DocPath 已有流程文档和 R-143 的结构化上下文索引，但业务交付物缺少统一模板、落盘路径和任务内索引；后续角色模型若没有 deliverables 约束，专家产出容易停留在聊天中。
- 目标: 增加轻量 deliverables 模板与索引，使 PRD、竞品分析、架构简报、原型审查、QA 报告和干系人更新能被生成、追踪和校验。
- 背景: R-146 建议 R-144 在 R-143 后推进，作为 R-142 role-based context 的产物落盘规范。
- 可选方案: A. 做大型模板 CMS；B. 做轻量 CLI 模板/索引/check 校验；C. 暂缓模板，等 R-142 后再补。
- 推荐方案: 采用 B。新增 `docpath deliverables list|render|check`，模板固定少量高频类型，索引写入任务目录，check 校验必填章节。
- 不做什么: 不做角色注册表；不做专家团自动编排；不绑定 Codex Skill；不把模板扩展为大型 CMS。
- 成本: 新增模板/索引模块、CLI 注册、check 接入和测试。
- 风险: 模板膨胀、章节校验过严、生成路径覆盖用户文件。
- 回滚方案: deliverables 没有索引时 check 不阻断旧任务；render 默认不覆盖已存在文件。
- 用户确认: 用户明确要求按 R-143 -> R-144 -> R-142 -> R-145 顺序推进；R-146 文档提供决策依据。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-144 与任务 T-20260609-deliverables 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
