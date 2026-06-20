---
kind: design-preview
status: draft
version: 1
required_sections:
  - 布局与栅格
  - 尺寸规格
  - 间距标度
  - 图标系统
  - 颜色与 Tokens
  - 动效规格
  - 交互逻辑
  - 技术约束
---

# Design Preview — 设计稿

> 用途：在写产品 UI 代码前，把 ui-brief.md 的「方向」冻结成「精确值」。

## 1. 布局与栅格

- 栅格：12 列，gutter 24px, max-width 1200px
- 断点：mobile <640px / tablet 640–1024px / desktop >1024px
- 区域划分：Header 占满宽 100% 高 64px；Main 占据余下全部空间；左右分栏（桌面端左侧 Sidebar 240px，右侧主内容区，移动端折叠为单栏上下堆叠）
- 各断点布局：desktop 采用双栏（左 Sidebar 240px，右 Content 填充）；mobile 采用单栏自适应布局，所有表格 actions 转为独立行或弹性包装排布

## 2. 尺寸规格

| 元素 | 宽 | 高 | 说明 |
|---|---|---|---|
| Header | 100% | 64px | 顶部导航栏 |
| Sidebar | 240px | fill | 侧边栏，自适应视口高度 |
| 按钮 sm | auto | 28px | 最小宽度 48px，用于表格内操作 |
| 弹窗 Modal | 640px | auto | 最大高度 80vh，居中定位 |
| 弹窗日志区 | 100% | 400px | 最小高度 200px，最大高度 500px，支持 y 轴滚动 |

## 3. 间距标度

- 标度（base 4px）：4px / 8px / 12px / 16px / 24px / 32px / 48px
- token 映射：space-1=4px, space-2=8px, space-3=12px, space-4=16px, space-6=24px, space-8=32px, space-12=48px
- 应用约定：表格行内边距 8px (space-2)；操作按钮间距 8px (space-2)；模态框内边距 24px (space-6)；主面板间距 24px (space-6)

## 4. 图标系统

- 图标库：Lucide Icons (v0.400.0)
- 默认尺寸：16px / 1.5px 描边
- 语义映射：
  - Claim/启动 = Play
  - Done/完成 = Check
  - Block/阻塞 = AlertCircle
  - Skip/跳过 = SkipForward
  - Terminate/终止 = XCircle
  - Release/释放 = Unlock
- 用色规则：图标继承文本色 currentColor；状态图标使用各自状态的 CSS 变量颜色

## 5. 颜色与 Tokens

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| --bg | #FFFFFF | #0B0E14 | 页面背景 |
| --surface | #F5F6F8 | #161B22 | 卡片/面板/输入框 |
| --text | #1A1D23 | #E6EDF3 | 主文本 |
| --text-muted | #6B7280 | #9CA3AF | 次要文本 |
| --primary | #2563EB | #3B82F6 | 主操作/Claim 按钮 |
| --success | #16A34A | #22C55E | 成功/Done 按钮 |
| --warning | #D97706 | #F59E0B | 警告/Block 按钮 |
| --error | #DC2626 | #EF4444 | 危险/Terminate/Release 按钮 |
| --border | #E5E7EB | #30363D | 描边/分隔线 |

## 6. 动效规格

- 时长标度：fast 120ms / base 200ms / slow 320ms
- 缓动：进入 cubic-bezier(0.16, 1, 0.3, 1)；退出 ease-in 150ms
- 应用：按钮 hover 120ms 颜色渐变；Command Modal 进入 240ms 渐显 + translateY(8px) 缓动；日志追加滚动 150ms 平滑偏移
- 降级：prefers-reduced-motion 时关闭位移动画，仅保留 80ms 的不透明度淡入淡出

## 7. 交互逻辑

- 操作触发：点击操作按钮（如 Claim、Done 等）直接发出 API 请求，同步调起 Command Modal
- 模态框行为：显示 "Running..." 状态与对应的命令行，实时追加 stdout/stderr 内容。滚动条自动锚定到底部。
- 确认与关闭：命令完成后显示 Exit Code 与 Close 按钮。ESC 键或点击 Backdrop 遮罩层关闭模态框。
- 键盘焦点：Tab 键顺序移动；模态框打开时焦点锁定在 Close 按钮；焦点环采用 2px solid --primary

## 8. 技术约束

- 绑定技术栈：React 19 / CSS 变量（定义在 styles.css 中）
- 性能预算：首屏 JS < 150KB，渲染延迟 < 50ms，滚动和日志追加帧率稳定在 60fps
- 可访问性：颜色对比度 >= 4.5:1；图标按钮提供 descriptive title 与 aria-label；所有按钮均可通过 Tab 访问
- 浏览器/设备支持：最新版 Chrome / Safari / Firefox；最小支持视口 360px 宽度
