# R-290 Analysis — 协议 Lifecycle 顺序与 CLI 门禁矛盾

## 1. 缺陷

CLAUDE.md 等协议文档的 Lifecycle 块把 `docpath agent enter` 排在 `docpath go --step S1` 之前（"Enter ... before code or protocol edits"），但 CLI 实际门禁相反：agent enter 在 phase=planning fail-loud，要求"先运行 go --step <id>；agent enter 只在具体步骤已进入 executing 后使用，避免提前写入 pending-done"（2026-07-26 R-288 实施中实测）。Worktree 示例更缺 go：`promote → agent enter → agent step S1`。Agent 按文档执行必然撞门禁。

## 2. 载体清单（R-277 全链清扫）

grep "agent enter" 命中 14 份：根 CLAUDE/AGENTS/CODEX/OPENCODE.md、templates/ 同名 4 份、templates/protocols/ 3 份、.docpath/protocols/ 3 份。

## 3. 方案

以 CLI 实际语义为准修正全部载体：
- Lifecycle 块顺序改为 go → agent enter（注明 enter 仅在步骤进入 executing 后作会话声明，可选）→ agent step done → check → agent done → handoff。
- Workflow 编号步骤同步：第 1 步 go 认领（进入 executing），第 2 步可选 agent enter。
- Worktree 示例补全：promote → plan → go --step S1 → 开发 → agent step done → check → commit。
- 修正后 grep 复核 14 载体零残留旧顺序。

## 4. 验收

- AC-1: 全部 14 份载体 Lifecycle/示例顺序与 CLI 门禁一致（go 先于 enter；示例含 go）。
- AC-2: grep 断言无 "agent enter\n...go --step" 旧顺序残留。
- AC-3: 仅文档变更，代码零改动；install 相关检查通过或按"本地领先"方向处理。
