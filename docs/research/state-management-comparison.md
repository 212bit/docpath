# 状态管理对比研究：Superpowers / Trellis / GSD vs DocPath

> 调研日期：2026-05-29
> 目的：分析三个主流 AI 工作流系统的状态更新机制，为 DocPath current.md 自动化提供参考

## 一、三个系统对比

| 维度 | Superpowers | Trellis | GSD |
|------|-------------|---------|-----|
| **仓库** | obra/superpowers (116k⭐) | robmclarty/trellis-exec | 本地 gsd-alternative |
| **状态存储** | 无集中状态文件 | `SharedState` JSON (`.trellis/state.json`) | `.planning/state.json` |
| **更新机制** | 纯 markdown skill 指令，AI 自行遵守 | `getState()` / `writePhaseReport()` 程序化 API | `update_state()` 程序化方法 |
| **状态内容** | 无（靠 skill 内 checklist 隐式追踪） | `completedTasks`, `modifiedFiles`, `phases`, `decisionsLog` | `current_phase_index`, `phases[]`, `status` |
| **防遗忘** | `verification-before-completion` skill 强制检查 | phase-orchestrator agent 启动时自动 getState()，结束时自动 writePhaseReport() | CLI 工具自动更新，AI 不直接写文件 |
| **上下文压缩** | 不处理 | `compactContext()` + state 兜底恢复 | state.json 兜底 |

## 二、各系统详细分析

### 2.1 Superpowers — "纪律执行层"

**架构**：纯 markdown skills + hooks

**Skills（14 个）**：
- `brainstorming` — 需求探索
- `writing-plans` — 计划编写
- `executing-plans` — 计划执行
- `test-driven-development` — TDD 流程
- `systematic-debugging` — 系统化调试
- `requesting-code-review` / `receiving-code-review` — 代码审查
- `verification-before-completion` — 完成前验证（核心防遗忘机制）
- `using-superpowers` — 入口 skill
- `subagent-driven-development` — 子代理驱动开发
- `dispatching-parallel-agents` — 并行代理调度
- `using-git-worktrees` — Git worktree 使用
- `finishing-a-development-branch` — 分支收尾
- `writing-skills` — Skill 编写指南

**状态管理**：
- **无集中状态文件** — 完全依赖 AI 自觉遵守 skill 中的 checklist
- `verification-before-completion` 是唯一的"防遗忘"机制：在 PR 提交前强制执行验证清单
- CLAUDE.md 中有严格的贡献指南（94% PR 拒绝率）

**优点**：极简，零依赖
**缺点**：无程序化保障，AI 可能跳过检查

### 2.2 Trellis — "规范记忆层"

**架构**：Skills + Agents + 程序化状态管理

**Skills（8 个）**：
- `status` — 显示当前执行状态
- `manage-phase` — Phase 生命周期管理（核心）
- `verify-work` — 工作验证
- `compile` — 编译检查
- `run` — 运行命令
- `explore-codebase` — 代码库探索
- `dispatch-agent` — 派发子代理
- `quick-query` — 快速查询

**Agents（9 个）**：
- `phase-orchestrator` — Phase 编排器（核心 agent）
- `implement` — 实现者
- `test-writer` — 测试编写者
- `fix` — 修复者
- `scaffold` — 脚手架
- `judge` — 评判者
- `reporter` — 报告者
- `browser-tester` / `browser-fixer` — 浏览器相关

**状态管理（核心创新）**：
```javascript
// getState() — 读取共享状态
const state = getState()
// => {
//   completedTasks: ["phase1-task1", "phase1-task2"],
//   modifiedFiles: {"src/types/tasks.ts": "Created type definitions"},
//   phases: { "phase1": { status: "in_progress", ... } },
//   decisionsLog: [...]
// }

// writePhaseReport(report) — 写入 phase 报告
writePhaseReport({
  summary: "Phase 1 complete",
  completedTasks: [...],
  modifiedFiles: {...},
  decisions: [...]
})

// recordDecision(decision) — 记录决策
recordDecision("Using React Query for data fetching")

// compactContext() — 压缩上下文（保留 state 兜底）
```

**生命周期**：
1. phase-orchestrator 启动 → 自动调用 `getState()`
2. 执行任务 → 通过 `recordDecision()` 记录决策
3. 任务完成 → 调用 `verify-work` 验证
4. Phase 结束 → 调用 `writePhaseReport()` 写报告
5. 上下文压缩 → `compactContext()` + state 兜底

**优点**：程序化保障，状态不会丢失
**缺点**：需要 Node.js 运行时，较重

### 2.3 GSD — "上下文编排层"

**架构**：Python CLI + YAML 模板 + JSON 状态

**状态管理**：
```python
# .planning/state.json
{
  "current_phase_index": 0,
  "phases": [
    {
      "name": "Phase 1: Setup",
      "status": "in_progress",
      "tasks": [
        {"name": "Initialize project", "status": "completed"},
        {"name": "Configure CI", "status": "pending"}
      ]
    }
  ],
  "status": "in_progress"
}

# update_state() — 程序化更新
def update_state(phase_index=None, task_status=None):
    state = load_state()
    if phase_index is not None:
        state["current_phase_index"] = phase_index
    if task_status is not None:
        state["phases"][state["current_phase_index"]]["tasks"][task_status["index"]]["status"] = task_status["status"]
    save_state(state)
```

**优点**：简单直接，Python 生态
**缺点**：AI 仍需主动调用 `update_state()`

## 三、DocPath 当前问题

### 3.1 current.md 的问题

```markdown
# 📍 当前工作流状态
```yaml
level: 3
state: check_pass
task_id: T-20260528-harness-lite
task_title: Harness Lite - 轻量证明机制
phase: completed
```
```

**问题**：
1. **手动 markdown** — AI 需要记住在任务切换时更新，经常遗忘
2. **自由格式** — 没有结构化约束，容易写错
3. **没有生命周期绑定** — 不像 Trellis 那样嵌入 agent 启动/结束流程

### 3.2 现有命令

- `docpath check` — 运行检查（已有 last-check.md 写入）
- `docpath context` — 显示当前上下文
- `docpath task` — 任务管理（创建/切换/完成）

## 四、方案 A 实现计划

### 4.1 设计原则

学 Trellis 模式：**AI 调命令，命令自动更新状态文件**

### 4.2 实现步骤

1. **`docpath check` 完成后自动更新 current.md**
   - 读取当前 current.md
   - 更新 `state` 字段为 `check_pass` 或 `check_fail`
   - 更新 `last_check` 时间戳
   - 写入 current.md

2. **`docpath task-done` 时自动归档 + 切换**
   - 将当前任务标记为 `completed`
   - 更新 current.md 的 `state` 为 `completed`
   - 如果有下一个任务，自动切换到下一个任务
   - 更新 current.md 的 `task_id` 和 `task_title`

3. **`docpath context` 读取 current.md**
   - 已有逻辑，无需修改

### 4.3 预期效果

- AI 只需调用 `docpath check` 和 `docpath task-done`
- 状态文件自动更新，无需手动编辑
- 跨会话恢复时，`docpath context` 显示最新状态

## 五、总结

| 系统 | 核心思想 | 适用场景 |
|------|----------|----------|
| Superpowers | 纯指令，靠自觉 | 简单任务，单会话 |
| Trellis | 程序化 API，生命周期绑定 | 复杂任务，跨会话 |
| GSD | CLI 工具，JSON 状态 | 中等复杂度，Python 生态 |
| **DocPath (方案 A)** | **命令自动更新 markdown** | **渐进式工作流，跨会话** |

方案 A 的核心创新：**用 markdown 替代 JSON，用命令自动更新替代手动编辑**，兼顾可读性和自动化。
