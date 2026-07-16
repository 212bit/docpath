# T-20260716-wip-agent-handoff - WIP note on handoff/enter

> backlog_id: R-272

## 1. 背景与动机
会话中断后 breadcrumb 仅有「开始执行」。实现已在 2044874：agent enter/handoff 写 `.docpath/workspace/wip-note.md`。

## 2. 需求清单
### 功能需求
- [x] FR-1: agent handoff 写入 wip-note.md（task/step/dirty 摘要）
- [x] FR-2: agent enter 在 in_progress + dirty 时写入 wip-note.md
- [x] FR-3: 不通过 breadcrumb done 伪步骤引入 plan drift

### 非功能需求
- [x] NFR-1: WIP 文件位于 workspace 运行时目录

## 4.1 重大变更门禁
- [x] 否（已实现并测试）
### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
### Decision Brief
- 用户确认: goal 完成剩余 backlog；实现已落地 2044874

## 5. 验收标准
- [x] AC-1: handoff writes wip-note.md
- [x] AC-2: enter records WIP when dirty+in_progress
- [x] AC-3: no plan/breadcrumb drift
