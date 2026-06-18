## 执行计划

### S1: 复现并定位红测
- [x] S1: 复现并定位红测
- **描述**: 运行目标测试，确认 pending-done warning 重复写入的直接原因，并定位相关实现。
- **验收条件**: 明确失败断言、相关代码路径和修复点。
- **依赖**: 无

### S2: 修复 pending-done 告警幂等性
- [x] S2: 修复 pending-done 告警幂等性
- **描述**: 调整 stale pending-done warning 处理逻辑，确保同一哨兵只写入一次 breadcrumb，并保持 status/next 行为一致。
- **验收条件**: 对应红测通过，pending-done.md 写回 warned: true。
- **依赖**: S1

### S3: 补 completed 态 check.failed 边界
- [x] S3: 补 completed 态 check.failed 边界
- **描述**: 调整状态转移规则和测试，使 completed 阶段重新运行 check 失败时能记录 checking/check_fail，而不是抛非法状态转移。
- **验收条件**: transitionWorkflow 覆盖 completed -> check.failed，且不新增 CLI 命令。
- **依赖**: S2

### S4: 验证门禁并归档
- [x] S4: 验证门禁并归档
- **描述**: 运行 typecheck、完整测试和 docpath check，确认任务可通过门禁。
- **验收条件**: pnpm run typecheck、pnpm test、docpath check 均通过。
- **依赖**: S3

## 依赖关系图
S1 -> S2 -> S3 -> S4