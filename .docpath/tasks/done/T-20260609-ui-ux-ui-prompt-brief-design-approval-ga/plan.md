## 执行计划

### S1: 盘点现有 UI/UX gate、模板与 skill 入口
- [x] S1: 盘点现有 UI/UX gate、模板与 skill 入口
- **描述**: 梳理 R-155 已有 Design Preview / Visual Acceptance gate、`docpath check` 实现、`.codex/skills/docpath-design`、模板目录和现有测试夹具，明确新增 Approval Gate 的插入点和兼容边界。
- **验收条件**: 形成 evidence，列出受影响文件、现有产物路径、UI/UX 任务识别逻辑、R-155 兼容约束和非 UI 任务免打扰规则。
- **依赖**: 无

### S2: 新增 UI Prompt Brief 与 Page Brief 模板
- [x] S2: 新增 UI Prompt Brief 与 Page Brief 模板
- **描述**: 新增模板，包含 Product Context、Design North Star、Visual Direction、Anti-goals、Design Tokens、Shared Components、Page Matrix、P0/P1/Later 优先级和 P0 Page Brief 字段。
- **验收条件**: 模板文件存在且结构可机器检查；覆盖 AC-1、AC-2、AC-3；文档明确多页面 UI 任务如何填写 Global Brief、Page Matrix、P0 Page Brief。
- **依赖**: S1

### S3: 新增 External Design Handoff 与 Design Approval 模板
- [x] S3: 新增 External Design Handoff 与 Design Approval 模板
- **描述**: 新增外部设计交接模板和 design approval 模板，记录 Stitch/Figma/v0/Framer prompt、输出链接/快照、选定/拒绝方向、实现约束，以及 pending/approved/rejected 状态。
- **验收条件**: 模板文件存在；approval 状态、批准来源、批准时间、批准说明、禁止方向可机器检查；明确“采用流程”不等于“批准具体设计方案”。
- **依赖**: S2

### S4: 更新 Codex Skill / Agent UI/UX 指引
- [x] S4: 更新 Codex Skill / Agent UI/UX 指引
- **描述**: 更新项目安装 skill 与模板 skill，使 UI/UX/layout/layout/navigation/visual/responsive/Figma/Stitch/v0 等触发词进入 UI Prompt Brief → Handoff → Design Preview → Design Approval → Implementation → Visual Acceptance 流程。
- **验收条件**: skill 明确未产出 UI Prompt Brief、Design Preview、Design Approval 前不得写产品 UI 代码；approval pending 时必须停机请求用户审批；覆盖 AC-7、AC-8、AC-11。
- **依赖**: S3

### S5: 实现 Design Approval Gate 检查逻辑
- [x] S5: 实现 Design Approval Gate 检查逻辑
- **描述**: 增强 `docpath check`，识别 UI/UX 任务、关键产物路径、implementation 步骤或 UI 代码改动，并在 approval 未 approved 时失败。
- **验收条件**: UI/UX 任务缺少 ui-brief/design-preview/visual-acceptance/design-approval 或 approval 非 approved 时失败；非 UI/UX 任务不受影响；R-155 gate 保持兼容。
- **依赖**: S4

### S6: 更新文档、规则与任务流程提示
- [x] S6: 更新文档、规则与任务流程提示
- **描述**: 补充推荐流程说明、模板索引、approval gate 使用方式和回滚说明，确保 agent 和用户都能理解 UI/UX 任务的强约束链路。
- **验收条件**: 文档包含 UI Prompt Brief → 外部设计工具 → 用户审批 → 实现 → Visual Acceptance；说明 Stitch/Figma/v0/Framer handoff；覆盖 AC-12。
- **依赖**: S5

### S7: 补充自动化测试与夹具
- [x] S7: 补充自动化测试与夹具
- **描述**: 新增或扩展 node tests，覆盖 approved/pending/rejected、缺失关键产物、非 UI 任务免打扰、R-155 兼容和 UI 代码改动触发 gate。
- **验收条件**: 相关测试能证明 AC-9、AC-10、AC-13；`node --test --test-concurrency=1 tests/*.test.mjs` 或聚焦测试通过。
- **依赖**: S6

### S8: 运行质量门禁、审查与归档
- [x] S8: 运行质量门禁、审查与归档
- **描述**: 运行 `pnpm typecheck`、`pnpm run build:test`、相关 node tests、`docpath check --skip-tests`、`docpath review`，修复失败后 journal 归档。
- **验收条件**: AC-14 通过；review 无错误；任务进入 completed；R-157 backlog 回填 done。
- **依赖**: S7

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
