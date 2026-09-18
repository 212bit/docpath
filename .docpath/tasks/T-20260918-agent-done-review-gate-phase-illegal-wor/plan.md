## 执行计划

### S1: 实现并验证 agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition
- [x] S1: 实现并验证 agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition
- **描述**: 完成 FR-1: agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: gate ∈ {none, check_fail} × {standard + `--skip-check`、quick + `--skip-check`、；AC-2: `--status blocked`} 执行 `agent done`，输出中不出现 `Illegal workflow transition` /；AC-3: `未预期的错误`，exit≠0 且给出明确的恢复命令。；AC-4: `--status blocked` 不再产生 `gate=review_fail` / `phase=reviewing`，而是写入；AC-5: 可达的 blocked 状态（且 `docpath status` 能正确渲染）。；AC-6: 新增/修改的转换规则有单测覆盖（`tests/` 现对 `agent done --status blocked` 零覆盖）；；AC-7: 既有正常路径（gate=check_pass 全量 done、quick 经 check 后收口）不回归。；AC-8: `check_fail` 仍被拒绝归档（F5 契约不回退）。；AC-9: 生成的 spec 可直接进入 `docpath plan`；AC-10: backlog 条目 R-349 与任务 T-20260918-agent-done-review-gate-phase-illegal-wor 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
