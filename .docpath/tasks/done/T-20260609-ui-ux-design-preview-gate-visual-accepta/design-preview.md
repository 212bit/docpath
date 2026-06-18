# Design Preview: UI/UX Design Preview Gate

## 目标
为所有 UI/UX、UI、前端页面、组件布局类任务，在进入写代码前冻结可追踪的视觉意图，避免只有 analysis/spec/plan 但没有可评审的界面方向，导致实现完成后才发现“不符合预期”。

## 信息架构与流程位置
- analysis/spec 阶段：识别任务是否属于 UI/UX 范畴。
- plan/go 之前：必须补充 design-preview.md，说明页面结构、布局层级、主要状态、响应式边界、参考/反参考。
- go/check 阶段：check 自动识别 UI/UX 任务，如果缺失 design-preview.md 或 visual-acceptance.md，则给出失败门禁。
- review/done 阶段：以 visual-acceptance.md 作为人工/Agent review 的 checklist。

## 文档内容边界
Design Preview 至少覆盖：
1. 信息架构：页面区块、主次关系、导航路径、空态/加载态/错误态。
2. 布局意图：桌面与移动端的可读可导航要求，不强制完整桌面等价体验。
3. 视觉参考/反参考：允许描述“像什么/不要像什么”，避免 Agent 自行发挥。
4. Snapshot 要求：首版必须支持 HTML snapshot 作为可复查产物；screenshot 可作为增强项但不强制。
5. 不做边界：明确 Later/Never，避免实现膨胀。

## 状态与交互
- preview 文档用于冻结“要长什么样”和“为什么这样设计”。
- acceptance 文档用于冻结“如何判定可接受”。
- 两者都应该是 Markdown，存放在当前任务目录和 canonical task 目录，便于归档/搜索。

## 响应式边界
移动端首版只要求可读、可导航、关键操作可触达；不要求与桌面端完全一致的复杂布局。
