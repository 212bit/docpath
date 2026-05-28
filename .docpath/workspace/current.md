# DocPath 当前状态

> ⚡ 此文件是状态机的核心寄存器。每次状态变更必须更新。

## 状态寄存器

```yaml
level: 1                  # 当前复杂度级别 (0|1|2|3)
state: check_pass         # 当前状态
task_id: T-20260528-link  # 当前任务 ID
task_title: "docpath init --link 关联项目功能"
phase: brainstorm         # Phase 名
started_at: 2026-05-28
updated_at: 2026-05-28T14:14
```

## 当前任务摘要

实现 `docpath init --link <path>` 命令，允许当前项目关联另一个项目的 `.docpath/` 目录，支持 monorepo 和微服务场景。

## 状态机映射

<!-- Plan Phase: 详细实现计划已生成，见 tasks/T-20260528-link/plan.md -->
