---
kind: ui-prompt-brief
status: shaped
version: 1
required_sections:
  - Product Context
  - Design North Star
  - Visual Direction
  - Anti-goals
  - Design Tokens
  - Shared Components
  - Page Matrix
  - P0 Page Brief
page_priorities:
  - P0
  - P1
  - Later
---

# UI Prompt Brief — Dashboard 设计简报

> 用途：在 UI 编码与高保真设计前，定义 Product Context 与全局设计方向。

## Product Context

- Product / surface: DocPath 本地控制台仪表盘 (Dashboard Web UI)
- Target user: 大模型 Coding Agent 及人类协作开发者
- User job: 直观掌握任务状态机 FSM 进度、排查 plan 与 breadcrumb 漂移、管理多 worktree 与活跃 session 进程、处理卡口门禁 (check/review/journal)
- Entry point: 本地独立 Web 端口 (默认 http://127.0.0.1:5179)
- Business or workflow context: 控制台与 DocPath 核心 CLI 状态同步，实时监控工作区变化及门禁决策
- Read/write boundary: 读状态 (state/plan/backlog) 全局开放；写操作 (如 S2 完成, 中断 Worktree) 触发底层命令调用并实时刷新状态机

## Design North Star

- Desired feeling: 严谨、高效、轻量、高信息可读性的极客感 (Developer-centric & robust)
- Primary UX outcome: 步骤推进清晰可见，门禁卡口原因一目了然，阻断与异常极速定位
- What users should understand in the first 5 seconds: 当前是哪个任务、在哪个步骤、处于什么状态 (idle/executing/completed/blocked)、以及下一步怎么做
- Quality bar: 顺畅的动效交互、准确的状态机指示器、响应式视口适配及良好的可访问性 (A11y)

## Visual Direction

- Layout direction: 经典的左侧固顶 Sidebar 导航 + 右侧主内容视口 (Dashboard Grid Layout)
- Information density: 中等信息密度，步骤与操作间距开阔，日志区域保持高密度可读性
- Color / contrast direction: 极客深色玻璃拟态 (Dark Glassmorphic Theme)，使用高对比度状态色作为强视觉信号
- Typography direction: 系统默认无衬线字体，英文字体优先使用 Outfit / Inter，代码及控制台使用 JetBrains Mono
- Motion / transition direction: 微交互动效，弹窗/Console 展开采用轻量位移与淡入，按钮点击带加载状态切换
- Reference products or screenshots: GitHub Desktop, Vercel Dashboard, Excalidraw

## Anti-goals

- Do not build: 多项目同时配置面板（只针对当前打开的 workspace 提供服务）
- Do not visually imply: 无法执行的操作不应展示可交互状态（如未通过 check 前不可点击 review）
- Avoid these patterns: 复杂的重度图表分析，一切以文字状态流、进程表和日志流为主
- Out of scope: 团队多成员协同配置以及云端部署相关的管理界面

## Design Tokens

| Token | Direction | Notes |
|---|---|---|
| Color | 暗色极客主题 (#090D16 背景，#121826 面板) | 配合半透明磨砂边框 #223049 |
| Typography | Outfit, Inter, JetBrains Mono | 支持多级字重与等宽字体 |
| Spacing | 4px 步进标度 | 常用 8px, 12px, 16px, 24px |
| Radius | 中等圆角规格 | 组件与卡片统一采用 8px (rounded-lg) |
| Elevation | 磨砂浮空阴影 | 20% 透明度投影，强化层级 |
| State colors | 绿色 (Ok) / 橙色 (Warning) / 红色 (Error) | 保证 WCAG AA 对比度 |

## Shared Components

| Component | Role | States | Notes |
|---|---|---|---|
| SidebarNav | 全局视口导航 | active / hover | 包含 Home, Workboard, Worktrees, Backlog, Settings |
| StepCard | 步骤单元展示 | done / running / pending / blocked | 展示步骤 ID、描述、用时及触发按钮 |
| ConsolePanel | 实时执行日志面板 | loading / empty / error | 底部可收放面板，展示实时控制台流 |

## Page Matrix

| Priority | Page / View | User goal | First-screen responsibility | Approval required? |
|---|---|---|---|---|
| P0 | 工作台 (Workboard) | 跟踪与推进步骤状态，查看日志 | 展示步骤 FSM 水平流、面包屑与 Terminal | yes |
| P0 | 工作树 (Worktrees) | 管理 Git 分支与 Agent 租约锁 | 列出本地隔离目录，提供强行中断按钮 | yes |
| P1 | 需求池 (Backlog) | 预览和整理 backlog 状态及优先级 | 提供条目矩阵视图与 promote 接口 | no |
| Later | 设置 (Settings) | 调整全局 workflow 规则与 LLM 键值 | 配置当前项目的 config.yaml 选项 | no |

## P0 Page Brief — 工作台主视角 (Workboard)

### Page Goal

提供当前活跃任务步骤的可视化流水线推进视图，集中展示执行日志及当前的门禁卡口证据。

### Primary User Questions

- 任务执行到哪一步了？上一步的门禁审查是什么结果？
- 现在的代码输出和状态有什么异常（是否发生了 plan-sync 漂移）？
- 控制台的执行日志有什么反馈？

### First Screen Layout & Wireframe (首屏布局与线稿)

> 可以使用 ASCII 艺术图绘制简易结构线框，或贴入 Excalidraw/Figma 线稿的截图/快照链接。
>
> ┌────────────────────────────────────────────────────────┐
> │ Header (Logo, Navigation, UserProfile)                 │
> ├──────────────┬─────────────────────────────────────────┤
> │ Sidebar      │ Main Content Area (Title, Actions)      │
> │ (Navigation, ├─────────────────────────────────────────┤
> │  Filters)    │ Data Visualizations / Cards / Lists     │
> └──────────────┴─────────────────────────────────────────┘

- Layout Wireframe:
  ```text
  ┌────────────────────────────────────────────────────────────────────────┐
  │  文径 DocPath Dashboard               [连接状态: ● 正常] [项目: docpath] │
  ├──────────────┬─────────────────────────────────────────────────────────┤
  │ 概览 (Home)  │ 📌 任务: T-20260621-docpath-dashboard-ui-design          │
  │ 工作台       │ 状态: [ 执行中 ]   阶段: [ executing ]   门禁: [ none ]  │
  │  (Workboard) ├─────────────────────────────────────────────────────────┤
  │ 工作树       │ 📊 FSM Steps                                            │
  │  (Worktrees) │ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ │
  │ 需求池       │ │ S1: 梳理设计   │ │ S2: 生成证据   │ │ S3: 验证上线   │ │
  │  (Backlog)   │ │ 状态: [  done  ] │ │ 状态: [running]│ │ 状态: [pending]│ │
  │              │ │ ⏱ 10m          │ │ ⏱ 进行中...     │ │ ⏱ 等待         │ │
  │              │ ├────────────────┤ ├────────────────┤ ├────────────────┤ │
  │              │ │ [查看面包屑]   │ │ [ ⏹ 标记完成 ] │ │ [ ▶ 开始执行 ] │ │
  │              │ └────────────────┘ └────────────────┘ └────────────────┘ │
  │              ├─────────────────────────────────────────────────────────┤
  │              │ 💻 终端日志控制台 (Live Logs)                            │
  │              │ ┌─────────────────────────────────────────────────────┐ │
  │              │ │ $ docpath write-design --template                   │ │
  │              │ │ ℹ [running] Initializing design template brief...     │ │
  │              │ └─────────────────────────────────────────────────────┘ │
  └──────────────┴─────────────────────────────────────────────────────────┘
  ```
- Header: 项目名 + 全局运行状态 + API 连接心跳
- Primary content: 当前任务标题、Level 标识、FSM 步骤水平排列矩阵
- Secondary content: 步骤内面包屑快照、控制台实时日志输出控制面板
- Persistent controls: 日志面板折叠按钮、中断/强制刷新状态按钮
- Responsive collapse: 面宽低于 768px 时侧边栏自动折叠

### Main Components

| Component | Responsibility | Required states |
|---|---|---|
| StepsTrack | 展示 FSM 步骤轨道 | idle / running / done / blocked |
| LogConsole | 渲染底层日志管道 | loading / streaming / error |
| StateHeader | 汇总当前任务全局状态元数据 | active / completed / drift-warning |

### Interaction

- Primary action: 点击 `[ ⏹ 标记完成 ]`（或 Claim）控制当前步骤的状态切换
- Secondary actions: `查看历史面包屑`, `收放控制台面板`
- Navigation: 通过 Sidebar 切换工作区页面
- Keyboard / focus behavior: Tab 进行步骤卡片聚焦，Esc 折叠控制台面板
- Confirmation points: 行动状态切换成功后发出行内微交互反馈，操作报错进行 toast

### Visual Acceptance

- Must show: 活跃步骤的高亮呼吸灯效果、高对比度的日志文字颜色
- Must not show: 无效步骤的交互按钮，避免无任务时的假数据占位
- Desktop acceptance: 三列完整的 Steps 网格 + 底部铺满的 Terminal 日志
- Mobile acceptance: Steps 水平滚动条 + Terminal 改为全屏弹窗抽屉
- Accessibility acceptance: 文字与背景色对比度符合 WCAG AA 规范
