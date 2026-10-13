# T-20261006-backlog-docpath-milestone-planner-groom- - 里程碑与Backlog粒度治理增强：docpath-milestone-planner技能、groom碎片检测与backlog merge命令

> backlog_id: R-486
> backlog_source: docpath backlog capture

## 1. 背景与动机

在实际使用里程碑和需求池过程中，用户与 Agent 在进行大目标规划与 Backlog 拆解时，容易产生**水平技术切片与过度碎片化**问题（如将建表、Mapper、XML、DTO 拆成多个微型 Backlog），导致任务管理开销大于编码收益。需要通过技能引导、巡检检测与一键合并工具提供端到端治理能力。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 提供 `docpath-milestone-planner` Skill，规范里程碑与 Backlog 垂直切片与适度粒度原则
- [ ] FR-2: 增强 `docpath backlog groom`，支持检测同一 Milestone 下的碎片化微型 Backlog 异味并给出合并建议
- [ ] FR-3: 新增 `docpath backlog merge` 命令行与底层引擎，支持一键将多条微型 Backlog 合并到目标 Backlog 中并自动治理关联

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath Backlog & Milestone 状态机完全兼容
- [ ] NFR-2: 提供结构化 `--agent` 输出与完备单测覆盖

## 3. 范围界定

### 包含
- `.docpath/skills/docpath-milestone-planner.md` 与安装模板分发
- `src/engine/backlog.ts` / `src/commands/backlog.ts` 中 groom 碎片检测逻辑
- `docpath backlog merge` CLI 注册与引擎实现
- 关联单元测试与活文档同步

### 不包含
- 不修改底层 ID 计数器分配机制

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 碎片检测算法 | 规则启发式（关键字+同Milestone聚类） | 启发式规则 | 轻量、确定性高、无LLM网络开销 |
| 2 | 合并后源条目处理 | 标记 dropped 归档 vs 物理删除 | 标记 dropped 归档 | 保证审计留痕与 ID 不断链 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: 拆解 Backlog 时容易过度碎片化，缺乏规范引导与一键合并工具
- 推荐方案: 新增 milestone-planner 技能 + groom 碎片检测 + backlog merge 命令
- 决策理由: 兼顾前置智能引导、后置巡检发现与便捷合并治理
- 用户确认: 用户已在对话中明确同意方案

## 5. 验收标准

- [ ] AC-1: `docpath-milestone-planner.md` 包含三层架构标准、自检清单与正反范例
- [ ] AC-2: `docpath backlog groom` 能识别同 Milestone 下的数据层/微型技术步骤碎片并输出建议
- [ ] AC-3: `docpath backlog merge R-A R-B --target R-A` 能正确合并内容、更新 AC、归档源条目并同步 Milestone
- [ ] AC-4: 单元测试覆盖率达标且全部测试通过
- [ ] AC-5: 活文档 `docs/features/backlog-lifecycle.md` 完成同步更新
