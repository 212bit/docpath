---
id: R-040
title: check 结构校验报错显示实际文件路径与定位
status: done
priority: P0
level: 1
source: "dogfood: 使用 DocPath 开发 R-039 时发现"
links:
  task: T-20260601-check
  spec: tasks/T-20260601-check/spec.md
created_at: 2026-06-01
---

## 背景

- 开发 R-039 时，`docpath check` 报结构校验失败但没有清晰标出实际读取文件路径与定位。
- 用户容易误判应修改 `.docpath/tasks/<id>/*` 还是 `.docpath/tasks/current/*`。

## 验收

- 结构校验失败时输出实际检查的文件路径。
- 对缺失章节、缺失 FR/AC、缺失步骤字段等错误给出足够定位信息。
