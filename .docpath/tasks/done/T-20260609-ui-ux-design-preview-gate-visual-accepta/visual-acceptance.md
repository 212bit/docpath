# Visual Acceptance: UI/UX Design Preview Gate

## 必须满足
- 对 UI/UX 任务，`docpath check` 能识别相关关键词，并在缺失设计文档时失败。
- 当前任务目录必须存在 `design-preview.md` 和 `visual-acceptance.md`。
- `design-preview.md` 必须包含信息架构、布局/状态、交互或响应式边界、参考/反参考、HTML snapshot 或不做边界等内容。
- `visual-acceptance.md` 必须包含可执行的验收项、禁止项、review 方式、snapshot/screenshot 要求。
- 新命令 `docpath write-design --kind preview|acceptance --stdin|--content` 可写入文档，并同步 current/canonical。

## 不得出现
- 不得只因为有 analysis/spec/plan 就允许 UI 任务直接进入代码实现。
- 不得强制所有非 UI 任务都写设计文档。
- 不得把 screenshot 作为首版硬依赖；HTML snapshot 是首版最低要求。
- 不得把 Teams 深度视图等复杂 UI 范围误纳入 MVP，除非 spec 明确要求。

## Review 方式
- 运行 `pnpm build` 验证 CLI 与 layout 构建。
- 运行 `docpath check --skip-tests --skip-lint`，确认 Design Preview Gate 通过。
- 对真实 UI/UX 任务，reviewer 需要对照 HTML snapshot 或页面预览检查视觉意图是否匹配。
