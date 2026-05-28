# DocPath 当前状态

> ⚡ 此文件是状态机的核心寄存器。每次状态变更必须更新。

## 状态寄存器

```yaml
level: 1                  # 当前复杂度级别 (0|1|2|3)
state: spec_written       # 当前状态
task_id: null             # 当前任务 ID (T-YYYYMMDD-xxx)
task_title: ""            # 任务标题
phase: S1
started_at: null          # 任务开始时间
updated_at: 2026-05-28T09:44
```

## 当前任务摘要

<!-- AI 在此描述当前任务的简短摘要 -->

## 状态机映射

<!-- AI 在此记录当前所处的状态机阶段和下一步动作 -->

---

*此文件由 DocPath 工作流引擎管理。手动修改需谨慎。*
