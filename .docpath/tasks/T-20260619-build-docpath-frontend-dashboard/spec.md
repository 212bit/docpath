# T-20260619-build-docpath-frontend-dashboard - Build DocPath frontend dashboard

> backlog_id: R-221
> backlog_source: docpath backlog capture
> user_confirmed: 用户已确认按多项目只读 dashboard MVP 推进。

## 1. 背景与动机

DocPath 已经具备 `docpath dashboard` 命令、只读 HTTP API、React/Vite dashboard UI、`build:dashboard` 脚本和基础页面。当前实现更像技术骨架：能读取 state/check/review/backlog，但还不能作为日常 dogfood 的多项目工作台使用。

本任务目标是把现有 dashboard 升级为本地只读 DocPath 信息面板，面向同时维护多个 DocPath 项目的 operator/agent。用户需要在一个界面里快速判断：哪些项目有活跃任务，哪些项目阻塞，当前项目下一步是什么，哪些 backlog 可推进，以及最近发生了什么事件。

已验证事实：

- `src/commands/dashboard.ts` 已提供本地 dashboard server 和只读 API。
- `src/dashboard-ui/` 已有 React/Vite UI，包含 Dashboard、Tasks、Gates、Backlog 页面。
- `src/engine/project-registry.ts` 已使用本地 SQLite 保存通过 `docpath init` 注册的项目，并支持 `DOCPATH_REGISTRY_DB` 覆盖。
- dashboard API 已能通过 `/api/projects` 列出注册项目，并通过 `root` query 参数读取当前 cwd 或已注册项目。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 多项目总览
  - dashboard 首页展示项目数、活跃任务数、阻塞项目数、最近失败 gate、registry health、install health 摘要。
  - 当前启动 cwd 即使不在 registry 中，也应作为 local project 可见。
  - 已注册项目按 `last_seen_at` / name 排序展示，并清楚标识 stale、unavailable、unknown schema。

- [ ] FR-2: 项目切换与单项目钻取
  - 用户能在侧边栏或项目列表中切换项目。
  - 选中项目后，所有项目级页面读取该项目的数据。
  - unknown root 必须被拒绝；`root` 参数只能读取当前 cwd 或 registry 中项目，避免任意路径读取。

- [ ] FR-3: 当前路线与健康状态展示
  - 单项目首页展示 phase、gate、current step、task id/title、next action、recommended command、gate policy、install health。
  - next route 数据应来自结构化状态/summary，不依赖解析人类渲染 Markdown。
  - partial data 场景要显示可用字段和明确错误状态。

- [ ] FR-4: Backlog 体验升级
  - Backlog 页面支持按项目查看。
  - 支持搜索、状态筛选、优先级筛选、readiness 筛选、level 显示、task/spec 链接摘要。
  - 跨项目总览展示各项目 backlog counts，不一次性展开所有 backlog 正文。

- [ ] FR-5: Tasks 体验升级
  - Tasks 页面展示每个项目的当前任务、任务 phase/gate、current step、最近更新时间。
  - 单项目任务详情展示已完成/阻塞步骤、canonical/current 状态、pending-done 或 closeout 信号。
  - 跨项目视图按 blocked、active、completed、idle 分组，便于快速扫描。

- [ ] FR-6: Messages / Events 视图
  - 提供近期事件流区域或独立页面，展示所选项目的 breadcrumb、check、review、session/runtime 事件摘要。
  - 事件读取必须有数量上限，跨项目视图只展示摘要，不一次性读取所有长日志。
  - 事件项要区分 source、time、severity/status、message、关联 task/step。

- [ ] FR-7: UI 状态与响应式
  - 覆盖 loading、empty registry、empty backlog、unknown project、deleted project、partial data、permission/read error、stale schema 状态。
  - 桌面优先保证高信息密度和可扫描性；移动端保持导航、筛选和表格可用。
  - 管理工具风格：克制、密集、清晰，不做营销页或装饰性 hero。

- [ ] FR-8: 只读 API 契约
  - dashboard API 保持 GET/HEAD only。
  - 不新增命令执行 endpoint，不在浏览器内执行 `docpath` 命令。
  - 不写 backlog、不注册或删除项目、不修改任务状态。
  - API 返回前端需要的结构化 payload，并保留现有 endpoints 兼容性。

- [ ] FR-9: 测试与构建
  - 测试覆盖多项目 registry API shape、当前 cwd fallback、unknown root 拒绝、stale/unavailable project 容错、只读保护。
  - 测试覆盖 dashboard build 隔离和关键 UI 数据转换。
  - `pnpm run build:test`、`pnpm run build:dashboard`、相关 node tests、`pnpm run typecheck`、`docpath check` 通过。

### 非功能需求

- [ ] NFR-1: 保持本地优先和只读安全边界，不扩大到远程公网服务。
- [ ] NFR-2: 数据读取应限制范围和成本，避免多项目场景一次性扫描大型日志。
- [ ] NFR-3: 尽量使用 JSON/JSONL machine truth；避免依赖 Markdown 人类视图解析。
- [ ] NFR-4: 保持现有 dashboard command、API endpoint 和 package build scripts 兼容。
- [ ] NFR-5: UI 必须通过设计 brief、design preview、design approval 后才能实现产品 UI 代码。

## 3. 范围界定

### 包含

- 扩展 dashboard 只读 API 与 payload shape。
- 多项目 registry 读取、当前 cwd fallback、unknown/stale/unavailable 项目状态。
- React dashboard 的信息架构、导航、总览、Backlog、Tasks、Gates、Events/消息视图升级。
- 只读边界和路径读取安全保护。
- UI brief、design preview、design approval、visual acceptance 证据。
- dashboard API/UI/build/typecheck/test 回归验证。

### 不包含

- 浏览器内执行 `docpath` 命令。
- 写入 backlog、accept/promote/go/check/review、注册/删除项目或修改 workflow state。
- 多用户权限系统、认证、远程公网 dashboard。
- 完整 daemon 重构或长期后台 watcher。
- 替换现有 CLI 工作流或改变 DocPath 核心状态机语义。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | MVP 边界 | 只读观察面板 / 浏览器内命令执行 / 完整 daemon | 只读观察面板 | 能显著提升可见性，同时避免权限和写入风险扩大 |
| 2 | 多项目来源 | 任意路径输入 / registry only / registry + 当前 cwd | registry + 当前 cwd | 复用现有 SQLite 注册中心，同时保证当前项目立即可见 |
| 3 | 数据契约 | 解析 Markdown / 结构化 JSON/JSONL / shell 调 CLI | 优先结构化 JSON/JSONL | 降低脆弱性，适合前端稳定消费 |
| 4 | 事件读取 | 全量读取 / 限量摘要 / 实时 watcher | 限量摘要 | MVP 保持轻量，避免大型 workspace 性能风险 |
| 5 | UI 路径 | 直接实现 / 设计审批后实现 | 设计审批后实现 | 本任务涉及产品 UI，必须保留 concrete design approval evidence |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [x] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [x] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [ ] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [x] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief

- 当前问题: 现有 DocPath dashboard 只有基础只读 API 和轻量页面，无法支撑多项目 dogfood 时对状态、下一步、backlog、任务和事件的快速判断。
- 目标: 构建本地只读多项目 dashboard MVP，让 operator/agent 能在一个界面中观察多个 DocPath 项目的状态和近期事件，并能进入单项目详情。
- 背景: 用户要求为 DocPath 实现前端，用于展示 DocPath 信息、backlog、正在运行的任务和消息；随后明确补充“支持多项目”。
- 可选方案: A 从零做新 web app；B 复用现有 dashboard 命令和 React/Vite UI，扩展只读 API；C 建完整 daemon/远程管理端并加入写操作。
- 推荐方案: 采用 B。它利用现有 dashboard、project registry 和测试基础，最小化架构风险，同时满足多项目可见性需求。
- 不做什么: 不做浏览器内命令执行；不写 backlog 或 workflow state；不注册/删除项目；不做远程公网服务、多用户权限或完整 daemon 重构。
- 成本: 中高，涉及 API shape、前端信息架构、UI 状态、事件读取、测试和视觉验收。
- 风险: 多项目聚合可能变慢；已注册项目可能移动/删除；不同项目 schema 可能不一致；Markdown 解析脆弱；如果后续加入写操作会扩大安全边界。
- 回滚方案: 回退 dashboard API/UI 变更，保留现有 dashboard 命令和 CLI workflow；若某个页面有问题，可按 route 局部回退。
- 用户确认: 用户已确认“同意”按多项目只读 dashboard MVP 推进。

## 5. 验收标准

- [ ] AC-1: `docpath dashboard` 启动后，多项目总览展示项目数、活跃任务数、阻塞项目数、最近失败 gate、registry health 和 install health 摘要。
- [ ] AC-2: 当前启动 cwd 未注册时仍作为 local project 可见；已注册项目按 `last_seen_at` / name 排序；stale/unavailable/unknown schema 项目有明确状态。
- [ ] AC-3: 项目切换后，Dashboard/Backlog/Tasks/Gates/Events 读取所选项目数据；unknown root 返回错误且不读取任意路径。
- [ ] AC-4: 单项目首页展示 phase、gate、current step、task、next action、recommended command、gate policy、install health 和最近 gate 状态。
- [ ] AC-5: Backlog 页面支持项目维度、搜索、状态/优先级/readiness 筛选、列表和详情摘要。
- [ ] AC-6: Tasks 页面支持跨项目分组和单项目任务详情，展示当前任务、步骤状态、canonical/current 状态和 closeout 信号。
- [ ] AC-7: Events/消息视图展示所选项目近期事件摘要，并对读取数量设上限；跨项目只展示摘要。
- [ ] AC-8: UI 覆盖 loading、empty、error、partial data、unknown/deleted project、permission/read error 和 responsive 状态。
- [ ] AC-9: API 保持只读，拒绝非 GET/HEAD 方法，不暴露命令执行 endpoint。
- [ ] AC-10: UI brief、design preview、design approval 已写入当前任务；实现后完成 visual acceptance。
- [ ] AC-11: `pnpm run build:test`、`pnpm run build:dashboard`、`pnpm run typecheck`、相关 dashboard tests 和 `docpath check` 通过。
