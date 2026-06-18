# T-20260609-docpath-fit-assessment - 对外部参考项目能力进行 DocPath Fit Assessment

> backlog_id: R-146
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景
R-142~R-145 来源于对 WorkFlowX 与 ExpertTeam-Codex 的参考吸收，但外部项目形态偏 Prompt/Skill/配置包，而 DocPath 的核心是文档状态机、CLI、可验证闭环。直接实现参考能力可能导致产品方向偏移，因此需要先做一次 DocPath Fit Assessment，判断哪些能力应进入核心、哪些只做适配层/模板、哪些应暂缓或拒绝。

## 目标
形成一份外部参考能力适配性评估报告，作为 R-142~R-145 是否进入实现、如何拆分、优先级如何调整的决策依据。

## 范围
- 评估来源：TreeX-X/WorkFlowX、ReJeCtAll/ExpertTeam-Codex。
- 评估候选：Expert Team/Role、role-based context、Payload、Hybrid Tree/token 压缩索引、deliverables 模板、Codex Skill 入口。
- 对每个候选能力判断：解决的问题、DocPath 是否已有等价能力、是否符合 spec→plan→go→check→review→journal 状态机、用户收益、实现成本、风险、建议结论。
- 输出对 R-142~R-145 的处理建议：保留/改写/拆分/降级/阻塞/关闭。

## 验收
- 生成 `docs/research/external-workflow-fit-assessment.md` 或等价研究文档。
- 文档包含候选能力评估矩阵，字段至少包括：来源、解决的问题、DocPath 现状、状态机兼容性、收益、成本、风险、结论。
- 明确给出 R-142~R-145 的后续建议与推荐执行顺序。
- 明确列出不可违反的 DocPath 适配原则，例如不绕过状态机、所有产物落盘、status/next/check/review 可感知。
- 该评估任务完成前，R-142 与 R-145 不应直接进入实现；R-143/R-144 可作为高信心候选但仍需经评估确认。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 对外部参考项目能力进行 DocPath Fit Assessment
  - 来源 backlog: R-146

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 对外部参考项目能力进行 DocPath Fit Assessment

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
- [ ] AC-2: backlog 条目 R-146 与任务 T-20260609-docpath-fit-assessment 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
