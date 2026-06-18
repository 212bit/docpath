# T-20260531-continue-next - 让 continue 命令对齐 next 路由与新状态模型

> backlog_id: R-037
> backlog_source: docpath backlog add

## 1. 背景与动机

`docpath continue` 目前仍依赖旧的 `state` 映射和硬编码的 `docpath:brainstorm` / `planning_done` / `build_pass` 等历史术语，没有复用当前 `phase/gate + next --agent` 的单一真源路由。结果是恢复命令给出的建议和真实工作流可能不一致，削弱了断线恢复的可信度。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath continue` 必须基于当前工作流真源给出恢复建议，而不是维护独立的旧状态映射。
- [ ] FR-2: continue 输出的推荐命令应与 `docpath next --agent` 保持一致，不再输出过时的 `docpath:...` 命令名。
- [ ] FR-3: 自动化测试需要覆盖 continue 在已完成任务或活跃任务场景下的恢复输出。

### 非功能需求
- [ ] NFR-1: 保留 continue 现有的 breadcrumb 恢复价值，但不再写状态。
- [ ] NFR-2: 修改应尽量复用现有 `next`/agent 输出逻辑，避免再复制一套路由规则。

## 3. 范围界定

### 包含
- continue 命令的恢复建议逻辑
- continue 输出文案中的命令名与状态解释
- continue 的回归测试

### 不包含
- 重写 next 路由本身
- 新增新的工作流状态字段

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 路由来源 | continue 自己维护映射 / 复用 next 路由 | 复用 next 路由 | 避免双真源继续漂移 |
| 2 | 恢复输出 | 只打印 next / breadcrumb + next | breadcrumb + next | 保留 continue 的上下文恢复价值，同时用统一路由给建议 |

## 5. 验收标准

- [ ] AC-1: continue 输出的建议命令与当前 `next --agent` 推荐一致。
- [ ] AC-2: continue 不再输出过时的 `docpath:...` 命令名。
- [ ] AC-3: 目标测试、全量测试和 `docpath check` 通过。
