# T-20260621-docpath-dashboard-ui-design - DocPath Dashboard UI Design

> backlog_id: R-227

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: DocPath Dashboard UI Design

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- DocPath Dashboard UI Design

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
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [ ] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [x] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 frontend-stack + design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: ## 背景
- 目标: DocPath Dashboard UI Design
- 背景: 来自 backlog R-227，Decision Brief 证据: Design DocPath Dashboard UI
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: User requested UI design flow

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-227 与任务 T-20260621-docpath-dashboard-ui-design 建立双向关联

## Journal Record

### 📝 任务摘要
通过 DocPath UI 设计证据链与门禁机制（Framework Decision 与 UI 设计门禁），为 DocPath Dashboard 控制台界面生成了标准的架构决策（React 19 + Tailwind v4）、设计简报与结构线稿、高保真设计参数设计预览、以及设计批准和视觉验收文件，建立了完整的可机检设计证据包。

### 🏗️ 架构决策
- 决策1: 前端框架选用 React 19 + React Router v7，并在 Vite 构建体系下运行，否决 Next.js 方案以减少不必要的 SSR 运维复杂度和静态包体积。
- 决策2: 样式和组件系统采用 Tailwind CSS v4 与 Lucide React 作为基础，通过 CSS 变量绑定系统设计 Token。

### 💡 经验教训
- 教训1: 设计证据与硬门禁前置逻辑（例如 go 阻断与 depth 具体值硬校验）能够有效逼迫 Agent 先明确技术约束与视觉参数，进而写出高内聚、少盲动的前端代码。

### 🔮 后续改进
- 改进1: 考虑在 dashboard 界面集成直接在线编辑和预览 design-preview 核心参数的交互小部件。
