# T-20260602-task - 修复状态机边界并恢复测试全绿

> backlog_id: R-078
> backlog_source: docpath backlog add

## 1. 背景与动机

- 项目当前已具备 Agent 工作流内核的基础能力，但 `pnpm test` 存在 1 个红测。
- `docpath check` 在已完成任务上重新验证失败时，会因 `check.failed` 不允许从 `completed` 阶段转移而抛出状态机错误，掩盖真实失败原因。
- 本轮目标是打磨既有状态机边界和门禁稳定性，不新增 CLI 命令。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 修复 stale pending-done warning breadcrumb 重复写入问题，确保告警幂等。
  - 来源 backlog: R-078
- [ ] FR-2: 支持 completed 阶段重新运行 check 后记录失败门禁，避免非法状态转移掩盖真实检查结果。
- [ ] FR-3: 保持现有 DocPath 命令接口不变，不新增命令。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 相关行为必须有自动化测试覆盖。

## 3. 范围界定

### 包含
- `pending-done` stale warning 的幂等修复。
- `check.failed` completed 态复验失败边界修复。
- 针对上述行为补充或调整测试。

### 不包含
- 新增 CLI 命令。
- 大规模重构命令注册层或检查系统。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 修复范围 | 优先修边界，不扩命令 | 采用 | 当前问题集中在状态机边界和测试红点，新增命令会扩大风险 |

## 5. 验收标准

- [ ] AC-1: `pnpm test` 全部通过。
- [ ] AC-2: `pnpm run typecheck` 通过。
- [ ] AC-3: `docpath check` 在当前任务验证阶段能够通过并记录通过门禁。
- [ ] AC-4: completed 阶段 check 失败不再触发非法状态转移错误。

---

*此文件由 `docpath backlog promote` 生成。*
