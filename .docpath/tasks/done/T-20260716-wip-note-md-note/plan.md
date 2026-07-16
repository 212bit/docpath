## 执行计划

### S1: 梳理 `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。
- [x] S1: 梳理 `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。
- **描述**: 根据 spec 明确 FR-1: `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。 的实现边界和验收口径。
- **验收条件**: AC-1: journal 推进到 completed 后 wip-note.md 被删除 (agent done 路径同效, 幂等)。
- **依赖**: 无

### S2: 实现 `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。
- [x] S2: 实现 `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。
- **描述**: 在现有架构内完成 FR-1: `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。 的代码与文档更新。
- **验收条件**: FR-1 `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `agent enter` 检测到 wip-note 的 task_id 与当前 task_id 不一致时视为陈旧: 打印一行提示并删除该文件, 再走现有 maybeRecordWipNote 逻辑。
- [x] S3: 实现 FR-2 `agent enter` 检测到 wip-note 的 task_id 与当前 task_id 不一致时视为陈旧: 打印一行提示并删除该文件, 再走现有 maybeRecordWipNote 逻辑。
- **描述**: 在现有架构内完成 FR-2: `agent enter` 检测到 wip-note 的 task_id 与当前 task_id 不一致时视为陈旧: 打印一行提示并删除该文件, 再走现有 maybeRecordWipNote 逻辑。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 验证验收标准
- [x] S4: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: journal 推进到 completed 后 wip-note.md 被删除 (agent done 路径同效, 幂等)。；AC-2: agent enter 遇 task_id 不匹配的陈旧 wip-note 打印提示并删除。；AC-3: R-272 行为回归通过; 新增用例覆盖 AC-1/AC-2, pnpm test 全绿。
- **验收条件**: AC-1: journal 推进到 completed 后 wip-note.md 被删除 (agent done 路径同效, 幂等)。；AC-2: agent enter 遇 task_id 不匹配的陈旧 wip-note 打印提示并删除。；AC-3: R-272 行为回归通过; 新增用例覆盖 AC-1/AC-2, pnpm test 全绿。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
