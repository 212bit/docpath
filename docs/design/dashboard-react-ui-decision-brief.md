# Dashboard React + UI 框架重构 Decision Brief

> Task: T-20260608-dashboard-react-ui  
> Backlog: R-129  
> Status: 已确认，可进入第一版实现任务。
> Confirmed: 2026-06-08，用户确认采用 React + Radix primitives + 自定义 CSS/design tokens，构建工具倾向 Vite，第一版只迁移 Agent 工作台核心视图。

## 背景

当前 Dashboard 已经覆盖本地只读 Agent 工作台、项目层级、Team 视角、SQLite registry、check/review/backlog/changes/handoff 等视图。实现集中在 `src/commands/dashboard.ts`：数据采集、HTML 渲染、CSS、前端交互脚本都在同一个 TypeScript 文件中，测试主要通过 `tests/dashboard.test.mjs` 断言输出 HTML 和 JSON 结构。

这套实现适合快速狗粮验证，但继续扩展 UI 时会出现三个问题：

- 渲染层和数据层耦合，任何 UI 调整都容易触碰数据构建逻辑。
- HTML/CSS/客户端脚本集中在字符串模板里，组件复用和状态同步成本升高。
- 现有测试大量匹配 HTML 片段，UI 重构容易产生大面积脆弱断言。

## 目标

- 使用 React 拆分 Dashboard UI 层，提高组件化、状态同步和交互维护能力。
- 选择一个 UI 框架或设计系统，支持工作台类产品的密集信息展示。
- 保持 Dashboard 第一版迁移后的只读边界：页面可以刷新、筛选、切换视图、复制命令，但不能修改 DocPath 状态。
- 保留 CLI 使用方式：`docpath dashboard --json`、`--print`、本地服务模式仍可用。
- 迁移过程可渐进，可回滚，不能一次性推翻当前可用页面。

## 方案比较

| 方案 | 优点 | 成本 / 风险 | 适用性 |
|---|---|---|---|
| Ant Design | 组件完整，表格、导航、统计、表单能力强；适合后台系统 | 视觉风格较重，默认样式明显；依赖体积和主题定制成本较高 | 适合需要快速搭后台，但可能让 DocPath Dashboard 显得通用化 |
| MUI | 生态成熟，组件覆盖完整，主题系统强 | 默认 Material 风格明显；包体积和样式运行时成本需要评估 | 适合大型 React 应用，但对当前 CLI 工具页面偏重 |
| Mantine | 组件丰富，Hooks/表单/通知等开发体验好；样式相对克制 | 引入整套组件体系；长期风格稳定性依赖框架演进 | 适合快速构建工具型应用，复杂度中等 |
| shadcn/Radix + 自定义样式 | 可访问性基础好，组件可复制进项目，视觉可控；适合做安静、密集的工作台 | 需要自己维护组件组合、样式 token 和构建链路；不是传统 npm UI 套件 | 最贴合 DocPath 当前“本地只读工作台”的产品气质 |
| 继续原生 HTML/CSS/JS | 无新增依赖，发布简单，现有测试稳定 | 文件继续膨胀，组件复用和复杂交互维护成本最高 | 适合短期小修，不适合继续重设计 |

## 推荐方案

推荐采用 **React + Radix primitives + 自定义 CSS/design tokens**，第一阶段不直接引入完整大而全 UI 框架。

理由：

- Dashboard 是本地开发者工具，不是通用 SaaS 后台，最重要的是信息密度、可扫描、只读可靠和低维护成本。
- Radix 负责菜单、对话框、tooltip、tabs 等交互基础，可访问性比手写组件更稳；视觉层由 DocPath 自己控制，避免 Ant Design/MUI 默认风格主导产品表达。
- 相比完整 UI 框架，这个方案更容易把迁移拆成薄层：先把现有 JSON 数据喂给 React，再逐步替换 view 层。
- 保留自定义 CSS token 后，后续如果确实需要组件库，也可以局部引入，而不是一开始绑定整套体系。

## 构建策略

推荐新增独立前端入口，但保持 CLI 后端形态不变：

- `src/commands/dashboard.ts` 继续负责数据采集、HTTP 服务、`--json` 输出和路由。
- 新增 `src/dashboard-ui/` 作为 React UI 源码目录。
- 使用 Vite 或 tsup 二选一构建静态资源，再由 Dashboard 服务内嵌或读取构建产物。
- 第一版优先保持 `--print` 可输出完整 HTML。若采用外部静态资源，需要明确 npm 包发布时 `files` 包含构建产物。

构建工具已确认倾向 Vite：

- Vite：前端开发体验好，React 插件成熟，作为第一版 React UI 构建工具。
- tsup：继续用于 CLI/Node 侧构建，不作为第一版 Dashboard React UI 的主构建工具。

## 迁移路径

1. 建立 UI 边界：把 Dashboard JSON schema 视为 UI 契约，先补充类型和快照式契约测试。
2. 搭建 React 壳层：第一版只迁移 Agent 工作台核心视图，不覆盖 Team/Backlog/Changes 等深层区域。
3. 保持只读行为：刷新仍调用 `/api/state`，命令只复制或展示，不执行状态修改。
4. 分批替换视图：先迁移导航、概览、Team/Project，再迁移 backlog、changes、handoff、documents。
5. 收敛旧模板：React UI 覆盖主要视图后，再删除旧 HTML 字符串模板。

## 依赖影响

用户已确认可进入实现任务。预计依赖类别：

- React runtime: `react`, `react-dom`
- 交互 primitives: `@radix-ui/*` 或 shadcn 选定组件对应依赖
- 构建工具: `vite`
- 可选图标: 若需要图标，优先 `lucide-react`

实现任务开始后可以按确认范围安装必要依赖，但不得引入 Ant Design、MUI、Mantine 等未选方案依赖。

## 测试策略

- 保留 `dashboard --json` 的数据结构测试，作为最稳定契约。
- 将 HTML 字符串断言逐步替换为更高层的 view contract，例如核心区域、data-testid、视图导航和只读行为。
- 增加 React 渲染层单元测试或轻量 DOM 测试，覆盖搜索、视图切换、刷新状态和空状态。
- 实现阶段再决定是否引入 Playwright；第一版如果只是本地只读页面，可先用现有 node test + 静态 HTML 检查降低成本。

## 风险

- 新增前端构建链路会增加发布和测试复杂度。
- 完整迁移可能导致当前 Dashboard 大量 HTML 断言失效。
- shadcn/Radix 方案需要项目自己维护视觉系统，不能完全依赖现成主题。
- 如果过早删除旧模板，会降低回滚能力。

## 回滚方案

- 第一阶段保持旧 `renderDashboardHtml` 可用，React UI 作为新渲染入口或可切换实现。
- 若构建或发布出现问题，移除新 UI 入口、依赖和构建脚本，恢复旧 HTML 模板路径。
- 迁移期间以 JSON 数据契约为稳定层，避免数据采集逻辑和 UI 重构同时大改。

## 用户确认结果

1. 同意推荐方向：React + Radix primitives + 自定义 CSS/design tokens。
2. 构建工具倾向：Vite。
3. 第一版范围：只迁移 Agent 工作台核心视图。

## 实现边界

- 可安装 React、React DOM、Vite、Radix primitives 和必要图标/测试依赖。
- 不引入 Ant Design、MUI、Mantine。
- 不一次性迁移 Team/Backlog/Changes 深层区域。
- 保持 Dashboard 只读边界和 CLI 兼容性。
