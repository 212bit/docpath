# T-20261001-executing-write-spec-backlog - 修复 executing 路由去自环与 write-spec 支持 Backlog 标题自愈

> backlog_id: R-468
> backlog_source: docpath start

## 1. 背景与动机

在真实项目开发中，Agent 遇到了两处影响流畅度的体验阻断：
1. **命令重复执行自环**：执行 `docpath go --step S1` 后，步骤已进入 `in_progress`，但 trailing `next_hint` 的 `recommended_command` 仍然返回 `docpath go --step S1`。根据 R-460 协议（直接信任 trailing hint），Agent 会陷入不断重执行 `docpath go --step S1` 的死循环中。
2. **`write-spec` 任务身份误报漂移**：当任务以 `docpath start "<title>" --draft` 拉起（分配 `T-` task ID）后，Agent 自然地将需求编号写入一级标题（如 `# R-167 - <标题>`）。`taskIdFromMarkdown` 将 `R-167` 误识别为 Task ID，导致 `assertActiveTaskFileWriteAllowed` 误判为任务身份不一致并拒绝写入。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 修复 executing 路由去自环 —— 当处于 `executing` 阶段且存在进行中的活跃步骤（`context.bc.inProgress > 0` 或 `activeStep` 存在）时，`inferRouteFromContext` 继承 `inferred` 路由推荐 `docpath step-pass --step <step>`，不再盲目重推 `docpath go`。
- [ ] FR-2: `write-spec` 支持 Backlog 标题自愈 —— `taskIdFromMarkdown` 仅匹配真实的 `T-` Task ID；当 Markdown 一级标题为 `# R-xxx - 标题` 且当前存在活跃任务时，自动将其解析为 `backlog_id: R-xxx` 并对齐到当前活跃任务 `T-xxx`，杜绝 `task identity mismatch` 假阳性拦截。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容，所有既有单测与新增用例全部通过。

## 3. 范围界定

### 包含
- `src/engine/agent-output/formatters.ts` 中的 `inferRouteFromContext` 逻辑修复
- `src/utils/structured-docs.ts`、`src/utils/task-files.ts` 和 `src/commands/write-spec.ts` 中的 Task ID / Backlog ID 识别与自愈
- 新增针对 executing in_progress 路由和 write-spec `# R-xxx` 标题自愈的测试用例

### 不包含
- 不修改底层 Backlog 与 Task 的分离存储模型

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Backlog ID 与 Task ID 关系 | 物理合并 vs 逻辑自愈兼容 | 逻辑自愈兼容 | 保持 1:N、工作区隔离与持久需求池的领域分离，在工具链入口做自动兼容 |
| 2 | executing 期路由推断 | 始终查 open step vs 优先 active step | 优先 active step | 避免在步骤已认领执行时推荐自身造成死循环 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程

### Decision Brief
- 当前问题: executing 路由自环与 write-spec 对 `# R-xxx` 标题误报漂移
- 目标: 修复 executing in-progress 路由指引，并支持 write-spec 标题自动识别 Backlog ID 与自愈
- 推荐方案: 修复 `inferRouteFromContext` 对 `activeStep` 的保留，并将 `taskIdFromMarkdown` 与 `write-spec` 对 `# R-xxx` 进行 backlog 映射处理
- 决策理由: 彻底消除 Agent 开发过程中的自环卡顿与 spec 写入摩擦
- 用户确认: 已确认

## 5. 验收标准

- [ ] AC-1: 当工作区处于 `executing` 阶段且步骤已进入 `in_progress` 时，`docpath next --agent` 和 `emitNextHint` 输出推荐 `docpath step-pass --step <step>`，不再输出 `docpath go --step <step>`。
- [ ] AC-2: 在活跃任务 `T-xxx` 下，通过 `write-spec --stdin` 传入 `# R-xxx - 标题` 或 `# 标题` 的 spec 内容能够成功落盘，自动记录 `backlog_id: R-xxx` 且不报 `task identity mismatch`。
- [ ] AC-3: 全量测试套件通过。
