## 执行计划

### S1: 实现并验证 next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）
- [x] S1: 实现并验证 next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）
- **描述**: 完成 FR-1: next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步），随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: `phase=executing` 且 plan 存在未完成步骤时，`next` / `next_hint` 的 `recommended_command` 为 `docpath go --step <下一个未完成步骤 id>`，不再是 `docpath agent enter`；；AC-2: `docpath agent enter` 命令本身保留（仍作为会话入口：加载状态、生成 context-index、写 pending-done 哨兵），只是不再作为 `next` 的常规下一步推荐；；AC-3: 无 plan / 无法解析未完成步骤时仍给出可操作降级（不得退化为推荐一个不可执行的命令）；；AC-4: quick profile / troubleshooting / 有 pending-done 哨兵等既有分支语义不变；；AC-5: 回归测试覆盖：executing + 未完成步骤 → 推荐 `go --step <id>`；并确认既有 `agent enter` 相关测试（agent-lifecycle / major-change-gate / payload-context-index）不受影响。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-364 与任务 T-20260923-next-executing-agent-enter-go-step 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
