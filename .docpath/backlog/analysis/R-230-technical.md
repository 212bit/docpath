# DocPath UI Design - Technical Analysis

## 1. 架构影响与模块边界

### 现有技术栈
- **前端框架**：React 19.1.0
- **路由**：React Router DOM 7.6.2
- **样式**：Tailwind CSS 4.3.1（通过 @theme 自定义变量）
- **图标**：Lucide React 1.21.0
- **构建工具**：Vite 6.3.5
- **语言**：TypeScript 5.8.3

### 架构边界
```
┌─ Dashboard UI (Port 5178) ───────────────────────┐
│  src/dashboard-ui/                               │
│  ├── src/main.tsx           - 应用入口          │
│  ├── src/views/             - 页面组件          │
│  ├── src/state/             - 数据层（useDashboardData） │
│  ├── src/lib/api.ts         - 后端 API 调用    │
│  └── src/styles.css         - 全局样式          │
└──────────────────────────────────────────────────┘
                    ↓ HTTP
┌─ Backend API (CLI 内置) ─────────────────────────┐
│  src/commands/dashboard-server.ts                │
│  - 读取 .docpath/ 文件系统                      │
│  - 执行 docpath 命令代理                         │
│  - 返回 JSON 数据                                │
└──────────────────────────────────────────────────┘
```

### 设计系统改造边界
- **需改动**：
  - `src/dashboard-ui/src/styles.css`（核心 CSS 变量和组件样式）
  - 各页面组件的 className（从 Obsidian 风格迁移到温暖风格）
  - 可能新增 `src/dashboard-ui/src/components/` 目录提取可复用组件
- **不改动**：
  - 状态管理逻辑（`useDashboardData.ts`）
  - API 接口（`lib/api.ts`）
  - 路由结构（`main.tsx` 的 Routes）
  - 构建配置（`vite.dashboard.config.ts`）

## 2. 数据模型/API/事件契约

### 数据模型（已存在）
```typescript
// 项目快照
interface ProjectSnapshot {
  project: { name: string; root: string; status: string; };
  state: { phase: string; gate: string; task_id: string; task_title: string; };
  route: { next_action: string; recommended_command: string; };
  task_progress: { done: number; total: number; in_progress: number; };
  check: { latest: { passed: boolean }; passed: number; failed: number; };
  events: Array<{ source: string; time: string; message: string; severity: string; }>;
  errors: string[];
  install_health: { passed: boolean };
}

// Dashboard 汇总
interface DashboardSummary {
  metrics: {
    projects: number;
    active_tasks: number;
    blocked_projects: number;
    failed_gates: number;
    install_failures: number;
  };
  attention: Array<{
    project_name: string;
    project_root: string;
    phase: string;
    gate: string;
    reason: string;
    recommended_command: string;
  }>;
  snapshots: ProjectSnapshot[];
  generated_at: string;
}
```

### API 端点
| 端点 | 方法 | 作用 | 返回 |
|------|------|------|------|
| `/api/summary` | GET | 获取所有项目汇总 | `DashboardSummary` |
| `/api/project/:root` | GET | 获取单个项目详情 | `ProjectSnapshot` |
| `/api/execute` | POST | 执行 CLI 命令 | `{ command, code, stdout, stderr }` |
| `/api/session/:id` | DELETE | 终止 session lease | `{ success: boolean }` |
| `/api/lease/:resource` | DELETE | 释放资源锁 | `{ success: boolean }` |

### 事件契约（不变）
UI 设计改造不影响现有的事件结构和 API 契约，仅改变数据的视觉呈现方式。

## 3. 依赖、迁移与兼容性

### 新增依赖（可选）
- **Fraunces**（serif 字体）：通过 Google Fonts CDN 引入，无需 npm 安装
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
  ```
- **或使用系统 serif**：`font-family: 'Georgia', 'Times New Roman', serif;`（无依赖）

### 迁移策略
1. **阶段 1**：在 `styles.css` 中新增 `.theme-warm` 类，保留原有样式作为 `.theme-obsidian`
2. **阶段 2**：根组件添加 className 切换逻辑：
   ```tsx
   const [theme, setTheme] = useState(localStorage.getItem('theme') || 'warm');
   <div className={`app-shell theme-${theme}`}>
   ```
3. **阶段 3**：验证无回归后，移除旧主题代码

### 浏览器兼容性
- **目标浏览器**：Chrome 120+, Firefox 120+, Safari 17+（现代常青浏览器）
- **CSS 特性**：
  - CSS 变量（`var(--)`）：全浏览器支持
  - `backdrop-filter`（毛玻璃效果）：Safari 需 `-webkit-` 前缀
  - Grid/Flexbox：全支持
- **不支持 IE**：DocPath 是本地开发工具，无需兼容旧版浏览器

## 4. 测试策略与质量门禁

### 测试策略
- **视觉回归测试**（手动）：
  - 截图对比：改造前后 7 个页面在 3 种状态下（空态/正常/错误）的截图
  - 工具：可使用 Percy.io 或手动截图存档
- **可访问性测试**：
  - 运行 Lighthouse Accessibility 审计，得分 > 90
  - 使用屏幕阅读器（VoiceOver/NVDA）验证关键流程
- **交互测试**（手动）：
  - 检查所有按钮、链接、模态框的交互
  - 验证 hover/focus/active 状态
- **响应式测试**：
  - 在 1920px、1440px、1024px 三种宽度下验证布局

### 质量门禁
- **编译通过**：`pnpm run build:dashboard` 无错误
- **类型检查**：`tsc --noEmit` 通过
- **Lint 检查**：遵循项目现有 ESLint 规则
- **视觉审查**：至少 1 名团队成员确认设计符合预期

### 不包含的测试
- ❌ 单元测试（UI 改造不涉及逻辑变更）
- ❌ E2E 测试（当前项目无 E2E 框架）

## 5. 安全、性能与运维风险

### 安全
- **XSS 防护**：React 自动转义，无需额外处理
- **CSRF**：Dashboard 是本地服务，无跨域风险
- **命令注入**：API 层已有参数校验，UI 层不直接拼接命令字符串

### 性能
- **CSS 体积**：预计增加 5-10KB（新增温暖色调变量 + 组件样式）
- **字体加载**：
  - 若使用 Google Fonts：首次加载增加 ~50KB
  - 若使用系统字体：无额外开销
- **优化措施**：
  - 使用 `font-display: swap` 避免字体阻塞渲染
  - 图标使用 Lucide React（已按需导入）

### 运维风险
- **低风险**：
  - 仅改动前端样式，不影响 CLI 核心逻辑
  - Dashboard 是可选功能，不影响 CLI 命令行使用
- **回滚方案**：
  - 通过 Git 回滚到改造前的 commit
  - 或通过环境变量 `DOCPATH_UI_THEME=obsidian` 切换到旧主题

### 潜在风险点
1. **对比度不达标**：terracotta 在浅色背景上对比度可能偏低
   - **缓解**：使用在线工具（如 WebAIM Contrast Checker）预先验证
2. **字体加载失败**：CDN 不可用或用户离线
   - **缓解**：提供系统字体降级方案（`font-family: Fraunces, Georgia, serif;`）
3. **用户不喜欢新设计**：主观审美偏好
   - **缓解**：保留主题切换能力，收集反馈后决定默认值
