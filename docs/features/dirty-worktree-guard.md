---
title: 任务脏路径基线与执行期 dirty guard
kind: feature
scope: workflow
level: 2
status: active
tags:
  - dirty-guard
  - adopt
  - git
related:
  - features/task-stash.md
  - features/worktree-workflow.md
summary: 执行期 dirty guard 按任务基线归属本任务改动，只拦截无法归属的新路径；promote 备份不再触发拦截，--adopt 不再借用 --accept-dirty。
---

# 任务脏路径基线与执行期 dirty guard

## 1. 问题背景与动机

`assertNoNonDocPathChangesForExecutionStart`（`src/utils/git-dirty-guard.ts`）在 `docpath go` 进入执行步骤前拦截工作区里无法确认为当前任务的未提交文件。真实使用里，`--accept-dirty` 绝大多数并不是在放行外部并发改动：

- 协议要求任务中途不提交，本任务自己的源码在下一步 `go` / `step-pass` 时仍是 dirty。
- `start --adopt` / `pick --adopt` 把认领记成 `acceptDirty`，面包屑里出现 `go --accept-dirty`。
- `backupCurrentTaskAlias` 写出的 `.docpath/tasks/promote-backups/` 在未 gitignore 的仓库里被当成外部文件。
- 错误提示把 `--accept-dirty "recover current-task edits before go"` 放在默认方案里，被原样照抄。

守卫要继续挡住真正的外部新文件。`--accept-dirty <reason>` 保留为显式逃生口。

## 2. 归属规则

脏路径快照写在 `.docpath/workspace/task-dirty-baseline.json`（工作区运行时文件，按 `task_id` 隔离）。每条路径带内容指纹；**守卫只看路径是否属于当前 `task_id`**，任务继续编辑已归属文件不会重新被拦。

一条脏路径在执行期放行，当且仅当满足任一条件：

1. 既有豁免：`.docpath/workspace/`、`.docpath/tasks/current/`、`.docpath/tasks/<taskId>/`、`.docpath/backlog/`、`.docpath/docs-index.json`。
2. DocPath 生成物：`.docpath/tasks/promote-backups/`。`assertCleanWorktreeForNewTask` 同样忽略该目录。
3. 路径在当前任务基线里。
4. 既有活跃任务放行（phase 为 `executing` / `checking` / `reviewing`，或 `planning` 且已有本任务执行面包屑）：关联 worktree 全放行；非 worktree 仍放行已跟踪改动。未跟踪且不在基线中的新文件继续拦截。

基线的写入点：

| 时机 | 函数 | source |
|---|---|---|
| `go --adopt`、`start --adopt`、`backlog pick --adopt` | `claimTaskDirtyPaths` | `adopt` |
| 第一次成功进入执行步骤 | `seedTaskDirtyBaseline` | `execution` |
| `endStepExecution`（`step-pass` 在调用下一步 `go` 之前） | `claimTaskDirtyPaths` | `step` |
| `go --accept-dirty` | `claimTaskDirtyPaths` 后跳过守卫 | `adopt` |

`seedTaskDirtyBaseline` 在本任务已有基线时不再扩写，避免把守卫放行之后才出现的外部文件补记进去。步骤收尾才会把这一步留下的新路径并入基线，因此下一步不需要 `--accept-dirty`。步骤收尾之后新出现、且不在基线中的未跟踪文件仍然被拦。

`--adopt` 的面包屑是 `go --adopt: claimed working tree changes into <step>`，不再写成 `go --accept-dirty`。

## 3. 接口与错误语义

- `readTaskDirtyBaseline` / `claimTaskDirtyPaths` / `seedTaskDirtyBaseline` 是基线的读写入口，任务 id 变化时不继承上一任务的路径。
- 执行期拦截文案仍以 `docpath go --step <step> --adopt` 为认领路径。`--accept-dirty "<列出文件及原因>"` 只出现在「确认是外部并发改动」的逃生口一行，不再提供可照抄的默认理由。
- `--accept-dirty <reason>` 行为不变：记录 `go --accept-dirty: <reason>` 并跳过当次拦截。

## 4. 验证

`tests/dirty-worktree-guard.test.mjs` 覆盖：本任务未跟踪文件经 `step-pass` 进入下一步且面包屑不含 `accept-dirty`；基线之外的新文件仍被拦截且报错不包含已归属路径；promote 备份不阻断 `go` 与 `quick`；`start --adopt` 认领路径并写入基线，输出与面包屑都不含 `accept-dirty`。
