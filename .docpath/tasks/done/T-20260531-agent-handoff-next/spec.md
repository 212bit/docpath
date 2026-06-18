# T-20260531-agent-handoff-next - 增强 agent handoff 交接包并附带 next 路由结果

> backlog_id: R-032
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档在 P1.3 / G6.1 中把 `agent handoff` 定位为“真正的 Agent 交接协议”，要求新会话只读 `compact-context.md` 就能恢复：既要看到当前状态、目标、失败证据、必读文件，也要直接看到 `next --agent` 给出的下一步路由。

当前实现已经比早期版本前进了一步：`compact-context.md` 内部已经包含 `## Next Agent Route` 和一段 `next --agent` YAML。但它仍存在两个明显差距：

- 交接包结构仍偏向“摘要列表”，没有被固定为设计文档要求的 handoff 视图，像 `Current State / Goal / Progress / Recent Failures / Next Action / Required Reading` 这些恢复关键字段没有形成稳定骨架；
- 现有测试只校验 handoff 文件“包含 next route 和 blockers”，没有约束更强的恢复结构，因此很容易再次退化成只是一段松散上下文。

这意味着 `agent handoff` 还没真正达到设计文档说的“新会话只读 compact-context 即可完整恢复”的标准。

本任务聚焦把 handoff 交接包升级为更明确、可验证的恢复协议，并补自动化测试保护其结构与 next 路由结果。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `agent handoff` 生成的 `compact-context.md` 必须明确展示当前状态、当前目标、进度、最近失败/阻塞、下一步动作和必读文件。
- [ ] FR-2: handoff 文件必须包含 `next --agent` 的机器可读结果，并让可执行的 `recommended_command` 在交接包中显式可见。
- [ ] FR-3: handoff 文件结构应稳定到足以让新会话主要依赖 `compact-context.md` 恢复，而不是再额外猜测要读什么。
- [ ] FR-4: 需要新增或增强自动化测试，覆盖 handoff 文件结构和 next route 的关键断言。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改变 `next --agent` 的输出契约，只增强 handoff 的呈现与恢复结构。
- [ ] NFR-3: 回归验证需串行执行，避免 `dist/` 清理导致的测试不稳定。

## 3. 范围界定

### 包含
- 增强 agent handoff 交接包并附带 next 路由结果
- `compact-context.md` 结构增强
- handoff 测试补强

### 不包含
- 重写 `next --agent` 路由逻辑
- 修改与 handoff 无关的协议模板
- 新增独立的会话存储格式

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | handoff 增强方式 | 仅追加更多自由文本 / 固定恢复结构 + next YAML | 固定恢复结构 + next YAML | 这样才符合设计文档里“只读交接包即可恢复”的要求 |
| 3 | 回归保护方式 | 只保留现有弱断言 / 增强结构化测试 | 增强结构化测试 | handoff 是跨会话关键资产，不能只靠人工目测 |

## 5. 验收标准

- [ ] AC-1: `compact-context.md` 明确包含 Current State、Goal、Progress、Recent Failures/Blockers、Next Action、Required Reading 等恢复关键字段。
- [ ] AC-2: handoff 文件中显式包含 `next --agent` 的 YAML 输出和可执行的 `recommended_command`。
- [ ] AC-3: handoff 自动化测试覆盖增强后的结构与 next route，并通过回归验证。
- [ ] AC-4: `pnpm build`、目标测试、`pnpm test`、`docpath check` 全部通过，任务闭环完成。

---

*此文件由 `docpath backlog promote` 生成。*
