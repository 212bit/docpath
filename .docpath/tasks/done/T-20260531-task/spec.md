# T-20260531-task - 增强非法工作流状态转移的错误提示

> backlog_id: R-033
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档在 G2.3 中明确要求：当 `transitionWorkflow()` 拒绝非法状态转移时，错误信息不应只停留在“不能从某个 phase 运行某事件”，而应同时给出当前 phase、允许的目标/来源和建议的下一步命令，帮助 Agent 直接恢复。

当前实现仍有明显缺口：

- `transitionWorkflow()` 在非法转移时只抛出 `Illegal workflow transition: {event} cannot run from phase={previous.phase}`；
- 错误信息没有展示该事件允许从哪些 phase 进入；
- 也没有给出下一步恢复建议，例如先执行 `docpath check`、`docpath review` 或 `docpath next --agent`。

这意味着一旦 Agent 在错误阶段调用工作流事件，CLI 虽然会 fail-loud，但恢复成本仍然偏高，需要再次手动分析 phase 和命令约束。

本任务聚焦增强非法状态转移的错误提示，使其符合设计文档对“可恢复、可操作”的要求，并为该行为补自动化测试。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `transitionWorkflow()` 在非法状态转移时，错误消息必须包含当前 phase。
- [ ] FR-2: 错误消息必须明确该事件允许的来源 phase 或可接受状态边界。
- [ ] FR-3: 错误消息必须包含建议的下一步命令，帮助 Agent 快速恢复。
- [ ] FR-4: 需要新增或增强自动化测试，覆盖增强后的非法转移提示内容。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不修改合法转移矩阵，只增强 fail-loud 诊断信息。
- [ ] NFR-3: 回归验证需串行执行，避免 `dist/` 清理引入测试噪声。

## 3. 范围界定

### 包含
- 增强非法工作流状态转移的错误提示
- `transitionWorkflow()` 非法转移诊断信息
- 对应回归测试补强

### 不包含
- 修改状态机合法转移矩阵
- 改写 `next --agent` 路由逻辑
- 修改与本任务无关的 policy / backlog 状态机

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 诊断增强策略 | 仅补更长报错文本 / 增加结构化恢复信息 | 增加结构化恢复信息 | 需要让 Agent 看到错误后能直接行动，而不只是知道失败 |
| 3 | 回归保护方式 | 手工验证 / 增强单元测试 | 增强单元测试 | 非法转移是底层行为，必须有稳定测试护栏 |

## 5. 验收标准

- [ ] AC-1: 非法转移报错中包含当前 phase、允许来源和建议的下一步命令。
- [ ] AC-2: 增强后的错误信息不会影响合法转移行为。
- [ ] AC-3: transitions 测试覆盖增强后的报错内容，并通过回归验证。
- [ ] AC-4: `pnpm build`、目标测试、`pnpm test`、`docpath check` 全部通过，任务闭环完成。

---

*此文件由 `docpath backlog promote` 生成。*
