# T-20260601-drift-auto-fix - 降低 tasks/current 漂移修复摩擦

> backlog_id: R-046
> backlog_source: docpath backlog add

## 1. 背景与动机

- DocPath 已经能检测 `tasks/current` 与 canonical 任务目录之间的漂移，并通过 `docpath tasks sync --from canonical|current` 显式修复。
- 当前摩擦点是 `docpath check` 发现漂移后只报错，用户或 Agent 需要手动判断方向、执行 sync、再重跑 check。
- 在日常开发中，AI 代理和人类都会频繁修改 spec/plan；对于明确知道修复方向的场景，应提供一条可脚本化、可追踪、仍然显式的自动修复路径。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath check` 支持 `--fix-drift <canonical|current>`，在检测到 active task 文件漂移时先执行同步，再继续质量检查。
- [ ] FR-2: `docpath next` 支持 `--auto-fix <canonical|current>`，当路由发现 active task 文件漂移时执行同步，并重新输出修复后的下一步建议。
- [ ] FR-3: 自动修复必须显式声明同步方向，不做隐式猜测；未提供方向时保持现有 fail-loud 行为和修复建议。
- [ ] FR-4: 修复成功后应重建 `current.md`，并在输出中列出已同步文件，便于追溯。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不覆盖现有 `docpath tasks sync --from ...` 能力，而是复用同一底层同步逻辑。
- [ ] NFR-3: 修复动作不得绕过 spec/plan 结构校验和测试门禁。

## 3. 范围界定

### 包含
- `docpath check --fix-drift canonical|current`
- `docpath next --auto-fix canonical|current`
- 对漂移修复成功路径、无漂移路径和参数校验补充测试

### 不包含
- 不实现交互式确认提示。
- 不实现双向自动合并或冲突解析。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 自动修复策略 | 隐式猜测 / 显式方向 | 显式方向 | 避免误覆盖用户刚编辑的 spec/plan |
| 3 | 实现入口 | 复制同步逻辑 / 复用 tasks sync 底层 | 复用底层 | 保持漂移修复行为一致 |

## 5. 验收标准

- [ ] AC-1: 当 current/canonical 漂移时，`docpath check --fix-drift canonical` 可同步 canonical 到 current 并继续检查。
- [ ] AC-2: 当 current/canonical 漂移时，`docpath check --fix-drift current` 可同步 current 到 canonical 并继续检查。
- [ ] AC-3: `docpath next --auto-fix canonical|current --agent` 可修复漂移并输出修复后的 route。
- [ ] AC-4: 非法修复方向会 fail-loud，提示合法值。
- [ ] AC-5: 新增测试通过，`docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
