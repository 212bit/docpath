# R-274 分析: wip-note.md 生命周期 (2026-07-16, 代码核验)

## 原捕获声明核验

| 声明 | 核验结果 |
| --- | --- |
| 未纳入 keep_workspace_views 会被 gc 误删 | **不成立**。keep_workspace_views 仅在 types/config.ts 定义 (DEFAULT_ARTIFACT_CONFIG), 全仓无任何消费方; gc 的 cleanupWorkspace/planWorkspaceCleanup 只处理 check-history/breadcrumb/sessions/leases, 不按白名单扫 workspace/*.md。 |
| 会进 docs-index 增噪 | 属实但无害: workspace/*.md 统一 generated_view/index_only, 与 current.md/breadcrumb.md 同待遇, 单条目。 |
| 生命周期未固化 | **属实且是真缺口**: agent.ts:117 writeWipNoteFile 只写不删; agent done/journal/新任务启动均不清理。R-272 流程指引下个会话 "inspect this note", 任务完成后的陈旧 note (含旧 task_id/step) 有真实误导面——尤其跨任务 resume 场景。 |

## 收窄后的需求

- FR-1: 任务收口时清理 wip-note——`docpath journal`(含经 agent done 触发) 成功推进到 completed 后删除 workspace/wip-note.md (存在才删, 幂等)。
- FR-2: agent enter 检测到 wip-note 的 task_id ≠ 当前 task_id 时视为陈旧: 打印提示并删除 (不再让旧任务 note 误导新任务会话)。

## 范围外 (另立条目)

- keep_workspace_views 死配置 (定义无消费, 本次捕获即被其误导) → 单独捕获: 要么接线要么删除。
