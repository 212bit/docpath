# T-20261006-milestone - Milestone里程碑全生命周期增强：智能正文拆解、风险燃尽分析、发布简报知识聚合与属性编辑巡检

> backlog_id: R-487
> backlog_source: docpath backlog capture

## 1. 背景与动机

DocPath 里程碑是面向宏观目标治理的核心底座。目前里程碑已具备基础的增删查、关联与简单发布能力，但在宏观目标推进的实际闭环中，仍缺乏：
1. 从 Milestone 正文直接智能拆解 Backlog 的便捷路径；
2. 进度大盘中的截止期健康度预测（On Track/At Risk/Overdue）与里程碑专属关键阻碍链分析；
3. 发布简报对关联 Task 架构决策（ADR / Decision Brief）的自动归集与 Git Tag 联动；
4. 里程碑属性编辑（edit）与结构完整性巡检（doctor）工具。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 增强 `docpath milestone decompose`，支持从正文或结构化输入中一键智能拆解并生成成形 Backlog
- [ ] FR-2: 增强 `docpath milestone status / track`，支持截止期健康度预测（On Track/At Risk/Overdue）与里程碑关键阻碍链分析
- [ ] FR-3: 增强 `docpath milestone release`，自动聚合关联 Task 的 Decision Brief / ADR 至发布简报，并提供 Git Tag 联动建议
- [ ] FR-4: 新增 `docpath milestone edit` 属性编辑与 `docpath milestone doctor` 完整性巡检治理能力

### 非功能需求
- [ ] NFR-1: 保持与现有 Milestone FSM 状态机及 `--agent` 输出格式向下兼容
- [ ] NFR-2: 完备单元测试覆盖与活文档同步

## 3. 范围界定

### 包含
- `src/engine/milestone.ts` 引擎核心能力扩展（健康度算法、ADR 聚合、doctor 巡检、edit 编辑）
- `src/commands/milestone.ts` & `src/commands/register/` CLI 选项注册与终端渲染
- 关联单元测试与 `docs/features/milestone-lifecycle.md` 文档同步

### 不包含
- 不引入外部大型依赖

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 健康度预测模型 | 基于目标截止期剩余天数与未完成 Level 权重 | 规则启发式 | 确定性高、可解释性强、零额外开销 |
| 2 | ADR 归集来源 | 扫描关联 Task 的 spec.md / breadcrumb 与 decisions.md | 多源融合提取 | 确保架构演进决策全生命周期留痕 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: 里程碑全生命周期缺乏正文拆解、健康度预测、发布知识聚合与巡检治理工具
- 推荐方案: 全量增强 decompose、status/track、release、edit 与 doctor 能力
- 决策理由: 形成从宏观目标规划到发布复盘的完整工程闭环
- 用户确认: 用户已在对话中明确选定全量完整增强方案

## 5. 验收标准

- [ ] AC-1: `docpath milestone decompose` 能从正文或参数智能生成规范化的 Backlog 并完成双向绑定
- [ ] AC-2: `docpath milestone status / track` 能准确计算健康度（on_track/at_risk/overdue）并展示 Top Blockers
- [ ] AC-3: `docpath milestone release` 能自动聚合 Decision Brief / ADR 并生成包含 Git Tag 建议的发布简报
- [ ] AC-4: `docpath milestone edit` 与 `docpath milestone doctor` 运行正常且能诊断断链或异常条目
- [ ] AC-5: 单元测试覆盖率达标，活文档 `docs/features/milestone-lifecycle.md` 完成同步更新
