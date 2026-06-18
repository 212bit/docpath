# 规约: 为 UI/UX 任务增加 UI Prompt Brief、Design Approval Gate 与 Codex Skill

**任务 ID**: T-20260609-ui-ux-ui-prompt-brief-design-approval-ga  
**Backlog**: R-157  
**层级**: level 3  
**状态**: drafting

## 1. 背景与动机

当前 UI/UX 任务已经具备 Design Preview 与 Visual Acceptance，但流程仍有两个关键缺口：

1. AI 可以在输出设计文档后继续进入实现，没有强制停机等待用户批准具体设计方案。
2. Design Preview 容易停留在 AI 自己生成的文字说明，缺少 UI Prompt Brief、外部设计工具 handoff，以及用户对具体视觉方案的 approval 记录。

R-157 的目标是把 UI/UX 任务从“有设计文档”升级为“有可审批的设计方案，并且未审批不得实现”。推荐链路为：

```text
UI Prompt Brief
→ External Design Handoff（Stitch / Figma / v0 / Framer 等）
→ Design Preview
→ Design Approval Gate（必须停机等待用户审批）
→ Implementation
→ Visual Acceptance
```

本任务要同时提供三层约束：

- **产物层**：新增 ui prompt brief、external design handoff、design approval 等可机器检查的模板/产物。
- **Agent 指引层**：通过 Codex Skill / 模板 skill 让 AI 在 UI/UX 任务开始时主动走审批流程。
- **门禁层**：增强 `docpath check`，当 UI/UX 任务已有实现步骤或 UI 代码改动但 Design Approval 未 approved 时失败。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 新增 UI Prompt Brief 模板，至少包含 Product Context、Design North Star、Visual Direction、Anti-goals、Design Tokens、Shared Components。
- [ ] FR-2: 多页面 UI 任务必须支持 Page Matrix，并声明页面优先级：P0 / P1 / Later。
- [ ] FR-3: P0 页面必须支持 Page Brief，至少包含 Page Goal、Primary User Questions、First Screen Layout、Main Components、Interaction、Visual Acceptance。
- [ ] FR-4: 新增 External Design Handoff 模板，支持记录 Stitch / Figma / v0 / Framer 等工具的 prompt、输出链接/快照、选定方向、拒绝方向和实现约束。
- [ ] FR-5: 新增 Design Approval 产物，包含 pending / approved / rejected 状态、批准来源、批准时间、批准说明和禁止方向。
- [ ] FR-6: UI/UX 任务必须区分“用户同意采用流程”和“用户批准具体设计方案”，不得把前者当作后者。
- [ ] FR-7: 新增或扩展 Codex Skill / Agent 指引；识别 UI、UX、layout、layout、navigation、visual、responsive、Figma、Stitch、v0 等触发词时，必须先执行 UI/UX 流程。
- [ ] FR-8: Skill 明确硬规则：未产出 UI Prompt Brief、Design Preview、Design Approval 前不得写产品 UI 代码。
- [ ] FR-9: `docpath check` 能识别 UI/UX 任务；若存在实现步骤或 UI 代码改动，但 Design Approval 不是 approved，则失败。
- [ ] FR-10: `docpath check` 能验证 UI/UX 任务至少具备 ui-brief、design-preview、visual-acceptance、design-approval 关键产物或等价 canonical 路径。
- [ ] FR-11: plan/go 流程不得自动越过 Design Approval Gate；AI 在 approval pending 时必须停机并向用户请求审批。
- [ ] FR-12: 文档说明推荐流程：UI Prompt Brief → 外部设计工具 → 用户审批 → 实现 → Visual Acceptance。
- [ ] FR-13: 对已有 R-155 Design Preview Gate 保持兼容，不破坏现有 check/test。

### 非功能需求

- [ ] NFR-1: 非 UI/UX 任务不应被 Design Approval Gate 误伤。
- [ ] NFR-2: Approval 状态必须可机器检查，不能只靠自然语言判断。
- [ ] NFR-3: 新模板应使用 Markdown/YAML frontmatter 或等价结构，便于 agent 和 check gate 读取。
- [ ] NFR-4: 不引入新前端框架、外部设计平台 SDK 或远程服务依赖。
- [ ] NFR-5: 保持现有 DocPath 生命周期和 R-155 Design Preview / Visual Acceptance 产物兼容。

## 3. 范围界定

### 包含

- UI Prompt Brief 产物模板。
- 多页面 UI 的 Global Brief、Page Matrix、P0 Page Brief 结构。
- External Design Handoff 产物模板。
- Design Approval 产物模板。
- Codex Skill / 模板 skill 指引更新。
- `docpath check` UI/UX gate 增强。
- 文档、规则或测试夹具更新。
- 针对新增门禁的自动化测试。

### 不包含

- 实际重构 产品 UI。
- 引入新的前端 UI 框架。
- 完整视觉回归平台或 screenshot diff CI。
- Web UI 中直接执行 DocPath 命令。
- 外部设计工具 API 集成。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | UI/UX 任务前置产物 | 只保留 Design Preview / 新增 UI Prompt Brief + Handoff + Approval | 新增完整审批链路 | Design Preview 本身不能证明用户批准了具体视觉方案 |
| 2 | Approval 表达 | 自然语言说明 / 机器可读状态 | 机器可读状态 | check gate 需要可靠识别 pending/approved/rejected |
| 3 | 强制点 | 只靠 Skill 提醒 / check gate 强制 | Skill + check gate | Skill 做前置导航，check gate 做最后强制器 |
| 4 | 外部设计工具 | 接入 SDK / 记录 handoff 证据 | 记录 handoff 证据 | 本任务不引入远程依赖，保持本地工作流 |
| 5 | R-155 兼容 | 替换旧 gate / 叠加新 approval gate | 叠加并兼容 | R-155 的 Design Preview / Visual Acceptance 仍然有效 |

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
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: UI/UX 任务可以在没有用户批准具体视觉方案的情况下进入实现，Design Preview 与 Visual Acceptance 只能证明有设计说明和验收矩阵，不能证明具体方案已获批。
- 目标: 在 UI/UX 任务中建立 UI Prompt Brief、External Design Handoff、Design Approval Gate、Implementation、Visual Acceptance 的强约束链路。
- 背景: 用户已要求完成 R-157，并已将 backlog 条目 accept/promote。
- 可选方案: 只更新 skill；只更新 check gate；同时更新模板、skill 和 check gate。
- 推荐方案: 同时更新模板、skill 和 check gate。单靠 skill 容易被绕过，单靠 check gate 发现太晚。
- 不做什么: 不接入外部设计工具 SDK，不重构 产品 UI，不改变非 UI/UX 任务默认路径。
- 成本: 需要新增模板、更新 check gate、补测试，并维护 UI/UX 任务识别规则。
- 风险: 误判 UI/UX 任务导致非 UI 工作被阻塞；approval 状态判断不严谨；历史任务/测试夹具被误伤。
- 回滚方案: 回退新增模板、skill 指引和 `docpath check` UI/UX approval gate 相关改动；R-155 Design Preview Gate 保持原状。
- 用户确认: 用户明确要求“完成 R-157”，且 R-157 已通过 `docpath backlog accept R-157` 进入 accepted 状态。

## 5. 验收标准

- [ ] AC-1: 新增 UI Prompt Brief 模板，包含 Product Context、Design North Star、Visual Direction、Anti-goals、Design Tokens、Shared Components。
- [ ] AC-2: 多页面 UI 任务支持 Page Matrix，页面优先级必须包含 P0 / P1 / Later 之一。
- [ ] AC-3: P0 Page Brief 模板包含 Page Goal、Primary User Questions、First Screen Layout、Main Components、Interaction、Visual Acceptance。
- [ ] AC-4: 新增 External Design Handoff 模板，记录外部工具 prompt、输出链接/快照、选定方向、拒绝方向和实现约束。
- [ ] AC-5: 新增 Design Approval 产物模板，包含 pending / approved / rejected 状态、批准来源、批准时间、批准说明和禁止方向。
- [ ] AC-6: 模板和文档明确区分“用户同意采用流程”和“用户批准具体设计方案”。
- [ ] AC-7: Codex Skill / 模板 skill 识别 UI/UX 触发词并要求先走 UI Prompt Brief → Handoff → Design Preview → Approval → Implementation → Visual Acceptance。
- [ ] AC-8: Skill 明确未产出 UI Prompt Brief、Design Preview、Design Approval 前不得写产品 UI 代码。
- [ ] AC-9: `docpath check` 能在 UI/UX 任务存在实现步骤或 UI 代码改动且 Design Approval 未 approved 时失败。
- [ ] AC-10: `docpath check` 能验证 UI/UX 任务具备 ui-brief、design-preview、visual-acceptance、design-approval 关键产物或等价 canonical 路径。
- [ ] AC-11: plan/go 或 Agent 指引不得自动越过 Design Approval Gate；approval pending 时必须停机请求用户审批。
- [ ] AC-12: 文档说明推荐流程，并明确 External Design Handoff 可记录 Stitch / Figma / v0 / Framer 等外部工具产物。
- [ ] AC-13: 现有 R-155 Design Preview Gate 相关测试仍通过，非 UI/UX 任务不受新 gate 影响。
- [ ] AC-14: `pnpm typecheck`、`pnpm run build:test`、相关 node tests、`docpath check --skip-tests` 和 `docpath review` 通过。
