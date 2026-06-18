# T-20260601-next-lesson - next 引导 lesson 候选固化

> backlog_id: R-047
> backlog_source: docpath backlog add

## 1. 背景与动机

- `docpath journal` 会把可复用经验写入 `.docpath/workspace/lesson-candidates.md`。
- 但任务完成后，`docpath next --agent` 当前只建议启动新 backlog；如果用户没有主动运行 `docpath learn`，这些候选经验不会沉淀进 `.docpath/spec/style.md` 或 architecture 规则。
- 需要让 next 路由在空闲或已完成状态下识别未吸收的 lesson 候选，并优先引导执行 `docpath learn`，打通开发经验到全局规范的闭环。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 当 `.docpath/workspace/lesson-candidates.md` 存在有效候选内容，且当前 workflow 处于 `idle` 或 `completed`，`docpath next --agent` 应推荐 `docpath learn`。
- [ ] FR-2: lesson 引导优先级应高于 `docpath backlog add` 和无 backlog 时的新任务建议。
- [ ] FR-3: 当存在已 accepted 的 backlog 条目时，next 仍应优先推荐 backlog promote，避免阻塞明确待执行任务。
- [ ] FR-4: 空文件、仅标题、或无 lesson 条目的 `lesson-candidates.md` 不应触发 learn 引导。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不修改 `learn` 命令的固化逻辑，仅增强 next 路由。
- [ ] NFR-3: route 输出应包含 lesson-candidates 文件作为 required_files，便于 Agent 可追溯。

## 3. 范围界定

### 包含
- 增强 `docpath next --agent` 的路由判断。
- 增加 lesson-candidates 检测 helper。
- 增加回归测试覆盖 completed/idle、accepted backlog 和空候选文件场景。

### 不包含
- 不自动执行 `docpath learn`。
- 不删除或清空 lesson-candidates。
- 不改变 learn 的去重规则。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 路由优先级 | learn 优先所有 / accepted backlog 优先 | accepted backlog 优先 | 明确待执行任务不应被学习动作阻塞 |
| 3 | 检测粒度 | 文件存在即触发 / 识别候选条目 | 识别候选条目 | 避免空模板误导 |

## 5. 验收标准

- [ ] AC-1: completed 且存在 lesson 候选时，`next --agent` 推荐 `docpath learn`。
- [ ] AC-2: idle 且存在 lesson 候选、无 accepted backlog 时，`next --agent` 推荐 `docpath learn`。
- [ ] AC-3: idle 且存在 accepted backlog 时，仍推荐 `docpath backlog promote <id>`。
- [ ] AC-4: 空 lesson-candidates 不触发 learn 引导。
- [ ] AC-5: 新增测试通过，`docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
