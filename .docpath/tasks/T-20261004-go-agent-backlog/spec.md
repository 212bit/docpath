# T-20261004-go-agent-backlog - 优化 go 与 Agent 路由中的 Backlog 自动关联及标题容错

> backlog_id: R-483
> backlog_source: docpath start

## 1. 背景与动机

在真实项目使用中，进一步深化 Backlog 与 Task 的协同与容错体验：
1. `docpath go` 在解析 `spec.md` 时（`readSpecFields`），若标题为 `# R-xxx - 标题` 或 `# 标题`，之前硬编码匹配 `# T-...` 会导致 `task_title` 提取为空，并在状态转移时清空标题；
2. `startStep` 调用 `transitionWorkflow` 时，若 `extraFields.task_id` 为空，应兜底使用已解析的 `resolvedTaskId`，确保任务 ID 绝对不丢失；
3. `agent-output` 在生成状态 YAML 时，若 `state.json` 尚未同步 `backlog_id`，自动回退取 `structuredSpec.backlog_id`，保证 Agent 路由器随时输出双向关联。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 优化 `docpath go` 的 `readSpecFields`，支持从 `# T-xxx - 标题`、`# R-xxx - 标题` 及普通 `# 标题` 中提取标题，且在 `startStep` 中确保 `taskId` 完整传递。
- [ ] FR-2: 优化 `generateAgentOutput` 中的 `backlog_id` 解析，当 `state.json` 缺少 `backlog_id` 时自动从 `structuredSpec` 回退获取。
- [ ] FR-3: 完善单测覆盖，验证 `go` 在各类 H1 格式下标题提取与状态更新的正确性。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容，全量门禁与测试套件通过。

## 4.1 重大变更门禁

### Decision Brief
- 当前问题: `go` 步骤执行中标题提取对 `# R-xxx` 标题容错不足，且 Agent 路由对 spec 中的 backlog_id 缺少回退反射
- 目标: 增强 `go` 与 `agent-output` 对 Backlog 标题与 ID 的自动关联和容错能力
- 推荐方案: 统一使用通用标题提取正则，并在状态生成层加入 `backlog_id` 回退
- 决策理由: 彻底闭环消除 Backlog 与 Task 协同中的边界漏洞
- 用户确认: 已确认

## 5. 验收标准

- [ ] AC-1: 当 `spec.md` 首行为 `# R-xxx - 标题` 时，`docpath go` 能够正确提取 `task_title` 并在 `current.md` / `state.json` 中保留标题。
- [ ] AC-2: `agent-output` 能够在 `state.json` 缺失 `backlog_id` 但 `spec.json` 存在时正确反射 `backlog_id`。
- [ ] AC-3: 全量测试套件通过。
