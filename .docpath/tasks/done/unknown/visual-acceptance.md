# Visual Acceptance — 项目总览仪表盘与侧边栏布局

## 验收项

| # | 验收项 | 状态 | 备注 |
|---|--------|------|------|
| 1 | 侧边栏展示 6 个导航项（总览/项目/检查/审查/待办/设置） | ✅ | Sidebar.tsx 已实现 |
| 2 | 导航项点击后 URL 同步变化，激活项高亮 | ✅ | React Router NavLink 实现 |
| 3 | 总览仪表盘展示 4 个统计卡片 | ✅ | DashboardPage 已实现 |
| 4 | 统计卡片背景色按类别区分（蓝/绿/黄/红） | ✅ | styles.css 定义颜色类 |
| 5 | 侧边栏底部显示 DocPath 版本号 | ✅ | Sidebar.tsx 包含版本标签 |
| 6 | <768px 侧边栏折叠为汉堡菜单 | ✅ | styles.css 媒体查询实现 |
| 7 | 所有页面骨架显示标题和描述 | ✅ | 6 个占位页均已创建 |
| 8 | `npm run build:dashboard` 编译无错误 | ✅ | 33 modules compiled |
