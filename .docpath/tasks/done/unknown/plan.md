## 执行计划

### S1: 搭建 UI 构建基础设施
- [x] S1: 搭建 UI 构建基础设施
- **描述**: 安装 React/Vite/React Router 依赖，配置 Vite 构建，创建入口文件（index.html, main.tsx, App.tsx），集成到 package.json scripts
- **验收条件**: `npm run build:dashboard` 编译成功，输出到 dashboard-dist/
- **依赖**: 无

### S2: 实现 .docpath 数据层
- [x] S2: 实现 .docpath 数据层
- **描述**: 编写 lib/docpath.ts 工具模块，封装读取 .docpath/ 目录下 JSON/MD 文件的方法（项目列表、任务统计、check 结果等），提供 React Hook 封装
- **验收条件**: 可在 React 组件中调用 useDocpathData() 获取项目统计数据
- **依赖**: S1

### S3: 实现侧边栏 + 顶部导航布局
- [x] S3: 实现侧边栏 + 顶部导航布局
- **描述**: 实现 Sidebar 组件（导航菜单 + 高亮激活项 + 响应式折叠）、TopBar 组件（页面标题 + 版本号 + 全局状态）、ContentArea 布局容器，配置 React Router 路由（含各模块占位页）
- **验收条件**: 侧边栏展示6+导航项，点击切换页面，URL同步变化
- **依赖**: S2

### S4: 实现项目总览仪表盘
- [x] S4: 实现项目总览仪表盘
- **描述**: 实现 DashboardPage 组件，包含统计卡片（总项目数/活跃任务/检查通过率/阻塞项）、最近活动列表、从 .docpath/ 读取真实数据
- **验收条件**: 仪表盘展示来自 .docpath/ 的真实统计数据
- **依赖**: S3

### S5: 响应式完善与测试
- [x] S5: 响应式完善与测试
- **描述**: 完善移动端适配（<768px 折叠导航）、添加微交互动效、构建验证、全部 AC 验收
- **验收条件**: 全部 AC 通过，`npm run build:dashboard` 无错误
- **依赖**: S4

## 依赖关系图
S1 → S2 → S3 → S4 → S5
