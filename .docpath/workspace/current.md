# 📍 当前工作流状态

```yaml
level: 3
workflow_profile: standard
state: check_pass         # 当前状态
task_id: T-20260616-add-backlog-promote-draft-flag-for-fast-
task_title: Add backlog promote --draft flag for fast-track workflow
phase: checking
gate: check_pass
current_step: 质量检查通过 (11 项)，下一步: docpath review
started_at: 2026-06-17T07:58:44.487Z
updated_at: 2026-06-17T07:58:44.486Z
```

> 📖 规约: [spec.md](../tasks/T-20260616-add-backlog-promote-draft-flag-for-fast-/spec.md)
> 📋 计划: [plan.md](../tasks/T-20260616-add-backlog-promote-draft-flag-for-fast-/plan.md)

## ✅ 执行检查清单

- [x] S1: 补齐 --draft 专项测试（promote 快速通道）
- [x] S2: 覆盖 accept/plan 的 --draft 通路
- [x] S3: 验证默认行为不变（回归守护）
- [x] S4: 全量 check 收尾

## 🧾 最近验证证据

- Last Check: [last-check.md](./last-check.md) — ✅ PASS · 11 项 · 2026-06-17T07:58:44.560Z
- Breadcrumb: [breadcrumb.md](./breadcrumb.md) — check · 状态: done · 质量检查通过 (11 项)

## 🔄 同步说明

本文件由 DocPath CLI 根据 `.docpath/workspace/state.json` 自动重建。
状态变化请通过 `docpath go/check/journal` 等命令推进，避免手工修改后与任务文档漂移。
