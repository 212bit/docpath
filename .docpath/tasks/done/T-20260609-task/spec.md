# T-20260609-task - 增强开发前分析深度与质量门禁

> backlog_id: R-149
> backlog_source: docpath backlog add

## 1. 背景与动机

# 增强开发前分析深度与质量门禁

## Background
DocPath 已经具备 predev analysis 入口和 analysis/ 分区目录，但当前 analyze 输出仍偏提纲式：缺少结构化问题澄清、用户/业务目标拆解、UI/UX 信息架构、技术可行性与风险分析、分析质量检查，以及不同复杂度下的分析深度控制。用户反馈“分析太过简陋，并且感觉分析不足”。

## Acceptance
- `docpath analyze` 从轻量提纲升级为可执行的开发前分析包，至少覆盖 requirements/product/ui/technical/risks/open-questions，并给出每个分区的深度模板、输出约束、证据/假设标注。
- 支持分析深度/模式参数（如 quick/standard/deep 或等价设计），默认不再过浅；deep 模式要求输出更完整的问题清单、用户旅程、UI状态/组件/交互、技术约束、风险矩阵、验收映射。
- 增加 analysis quality gate：可通过新命令或集成 check 检测分析分区是否缺失/过短/未标注假设/缺少开放问题与验收映射。
- product/design/software skills 文案同步升级，明确各 skill 负责更新哪些 analysis section，以及如何把分析转成 spec/plan。
- `plan`/`refine` 继续读取分区分析上下文，且提示词要求不得忽略 predev analysis。
- 更新测试覆盖 analyze 深度提示、section 写入、analysis gate、plan/refine 上下文。
- 完成 install --target codex、check、review、journal 归档。

## Notes
避免只堆长模板；应让分析可操作、可检查、可被后续 skill 分区迭代。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 增强开发前分析深度与质量门禁
  - 来源 backlog: R-149

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 增强开发前分析深度与质量门禁

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
- [x] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: predev analysis 已有入口和分区，但输出仍偏提纲式，缺少可执行分析包与质量门禁。
- 目标: 增强 analyze 深度、分模式输出、analysis gate、skills 分工与后续 plan/refine 使用。
- 背景: 用户反馈“分析太过简陋，并且感觉分析不足”，并确认继续增强。
- 可选方案: A. 只加长提示词；B. 增加模式化分析模板和可检查门禁；C. 引入复杂外部分析引擎。
- 推荐方案: B，保持 CLI 轻量，同时让分析可操作、可分区迭代、可门禁检查。
- 不做什么: 不引入外部服务；不强制所有任务必须 deep；不破坏 legacy analysis.md 兼容。
- 成本: 增加模板、检查逻辑、测试和 skill 文档维护成本。
- 风险: 模板过长导致噪音；门禁过严影响轻量任务。通过 quick/standard/deep 与可选 gate 降低风险。
- 回滚方案: 保留原 write-analysis 行为；analyze 模式可降级 quick；analysis gate 可独立关闭或仅提示。
- 用户确认: 2026-06-09 用户已确认继续增强开发前分析深度与质量门禁。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-149 与任务 T-20260609-task 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
