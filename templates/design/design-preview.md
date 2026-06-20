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
concrete_value_rule: >
  每个维度必须落到可实现的具体值（px / rem / hex / ms / 缓动曲线 / 具体组件名），
  不接受「方向」占位（例如「色彩偏冷」「间距适中」）。方向描述属于 ui-brief.md。
---

# Design Preview — 设计稿

> 用途：在写产品 UI 代码前，把 ui-brief.md 的「方向」冻结成「精确值」。
> 这是一份能直接交给前端实现的设计稿：布局、尺寸、间距、图标、颜色、动效、
> 交互、技术约束全部写成具体值。审批以本文件为准（design-approval.md）。
> 方向/北极星/用户目标留在 ui-brief.md，本文件不重复，只做精确冻结。

## 1. 布局与栅格

> 写出栅格列数、断点、各区域的占位与对齐。给出每个断点下的布局，不是「自适应」一句话。

- 栅格：<例如 12 列，gutter 24px，max-width 1200px>
- 断点：<mobile <640px / tablet 640–1024px / desktop >1024px>
- 区域划分：<Header / Sidebar / Main / Footer 的位置与占比>
- 各断点布局：<desktop 三栏；tablet 两栏；mobile 单栏堆叠顺序>

## 2. 尺寸规格

> 容器与核心组件的精确尺寸。必须出现 px / rem 等具体单位。

| 元素 | 宽 | 高 | 说明 |
|---|---|---|---|
| <Header> | <100%> | <64px> |  |
| <Sidebar> | <240px> | <fill> |  |
| <主按钮> | <auto> | <40px> | <min-width 96px> |
| <卡片> | <320px> | <auto> |  |

## 3. 间距标度

> 定义间距标度（spacing scale）与对应 token，组件间距引用标度，不写裸数字到处散落。

- 标度（base 4px）：<4 / 8 / 12 / 16 / 24 / 32 / 48px>
- token 映射：<space-1=4px, space-2=8px, space-3=12px, space-4=16px ...>
- 应用约定：<卡片内边距 16px；区块间距 24px；表单行距 12px>

## 4. 图标系统

> 指明图标库、默认尺寸与语义映射。不接受「用合适的图标」这种方向描述。

- 图标库：<lucide / heroicons / material-symbols / tabler / 自绘 SVG，含版本>
- 默认尺寸：<16px / 20px / 24px，描边宽度 1.5px>
- 语义映射：<新增=plus；删除=trash；成功=check-circle；警告=alert-triangle>
- 用色规则：<图标继承文本色 currentColor；状态图标用对应 state token>

## 5. 颜色与 Tokens

> 给出精确色值（hex / hsl / rgb），不是「偏冷的蓝」。覆盖语义 token、状态色与暗色。

| Token | 浅色 | 暗色 | 用途 |
|---|---|---|---|
| <--bg> | <#FFFFFF> | <#0B0E14> | 页面背景 |
| <--surface> | <#F5F6F8> | <#161B22> | 卡片/面板 |
| <--text> | <#1A1D23> | <#E6EDF3> | 主文本 |
| <--text-muted> | <#6B7280> | <#9CA3AF> | 次要文本 |
| <--primary> | <#2563EB> | <#3B82F6> | 主操作 |
| <--success> | <#16A34A> | <#22C55E> | 成功态 |
| <--warning> | <#D97706> | <#F59E0B> | 警告态 |
| <--error> | <#DC2626> | <#EF4444> | 错误/危险态 |
| <--border> | <#E5E7EB> | <#30363D> | 描边/分隔 |

## 6. 动效规格

> 给出时长（ms）、缓动曲线与动效原则。不接受「加点动画」这种描述。

- 时长标度：<fast 120ms / base 200ms / slow 320ms>
- 缓动：<进入 cubic-bezier(0.16,1,0.3,1)；退出 ease-in；强调 spring>
- 应用：<hover 120ms 颜色过渡；展开 200ms 高度过渡；模态 240ms 淡入+位移 8px>
- 降级：<prefers-reduced-motion 时关闭位移与缩放，仅保留不超过 80ms 的淡变>

## 7. 交互逻辑

> 逐组件/逐流程写清行为与状态机。覆盖 hover / focus / active / disabled / loading /
> empty / error 等关键状态，以及键盘与焦点行为、确认点。

- 主操作流程：<点击 → loading → 成功 toast / 失败行内错误>
- 关键状态矩阵：<列出每个核心组件在 loading/empty/error/disabled 下的表现>
- 键盘与焦点：<Tab 顺序；Esc 关闭；Enter 提交；焦点环 2px --primary>
- 确认点：<破坏性操作二次确认；离开未保存表单提示>

## 8. 技术约束

> 把设计绑回 frontend-stack.md 的技术现实：实现方式、性能预算、可访问性、浏览器支持。

- 绑定技术栈：<引用 frontend-stack.md 选定栈，说明 token 如何落地：CSS 变量 / 主题文件>
- 性能预算：<首屏 < 150KB JS；交互响应 < 100ms；动画 60fps 不掉帧>
- 可访问性：<对比度 ≥ 4.5:1；焦点可见；图标按钮带 aria-label；语义标签>
- 浏览器/设备支持：<最近两个版本的主流浏览器；最小视口 360px>
- 实现风险与取舍：<已知的实现成本、降级方案、未决问题>

