# T-20260716-wip-note-md-note - wip-note.md 缺生命周期终点: 任务收口不清理, 陈旧 note 误导下个会话

> backlog_id: R-274
> backlog_source: docpath backlog capture

## 1. 背景与动机

R-272 落地的 WIP note (agent enter dirty+in_progress / agent handoff 时写
workspace/wip-note.md) 只写不删: 任务 done/journal 后永久残留, 而 R-272 流程
指引下个会话 "inspect this note", 陈旧 note (含旧 task_id/step) 对跨任务
resume 有真实误导面。原捕获的 "keep_workspace_views 白名单误删" 前提经代码
核验不成立 (该字段无消费方, 另立 R-275); 分析见
.docpath/backlog/analysis/R-274-analysis.md。

## 2. 需求清单

### 功能需求

- [x] FR-1: `docpath journal`(含经 agent done 触发) 成功推进任务到 completed 后删除 `workspace/wip-note.md`; 文件存在才删, 幂等, 删除失败不阻断 journal 主流程。
- [x] FR-2: `agent enter` 检测到 wip-note 的 task_id 与当前 task_id 不一致时视为陈旧: 打印一行提示并删除该文件, 再走现有 maybeRecordWipNote 逻辑。

### 非功能需求

- [x] NFR-1: R-272 既有行为不变——in_progress+dirty 时 enter 写 note、handoff 无条件写 note 的语义与输出保持。

## 3. 范围界定

### 包含
- src/commands/agent.ts (enter 陈旧检测) 与 journal 收口路径的 wip-note 清理
- tests: AC-1/AC-2 用例 + R-272 回归

### 不包含
- keep_workspace_views 死配置处置 (R-275)
- wip-note 进 docs-index 的待遇调整 (index_only 现状可接受)

## 4.1 重大变更门禁
### 是否涉及重大变更
- [x] 否 (workspace 运行时视图的生命周期补全, 不动契约/权限/架构)

## 5. 验收标准

- [x] AC-1: journal 推进到 completed 后 wip-note.md 被删除 (agent done 路径同效, 幂等)。
- [x] AC-2: agent enter 遇 task_id 不匹配的陈旧 wip-note 打印提示并删除。
- [x] AC-3: R-272 行为回归通过; 新增用例覆盖 AC-1/AC-2, pnpm test 全绿。
