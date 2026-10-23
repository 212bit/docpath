---
title: 生命周期 Hook 与门禁阻断通知
kind: feature
scope: workflow
level: 2
status: active
tags:
  - hooks
  - plugins
  - gates
related:
  - features/dirty-worktree-guard.md
summary: on-gate-blocked 在门禁阻断转移时尽力通知。Hook 失败或超时不改变门禁结论，也不中断命令。
---

# 生命周期 Hook 与门禁阻断通知

## 1. 问题背景与动机

DocPath 已经能在步骤、检查、审查、收口前后执行 Hook（脚本、`config.yaml` 或插件）。这些事件描述的是「门禁正在跑」或「门禁已经通过」。门禁**挡住**一次转移时没有事件：脏工作区、`check` 失败、`review` 拒绝都只把错误打到终端。人要盯着会话才能知道流程停了。

`on-gate-blocked` 只做通知。它在结论已经是「阻断」之后发出，用来接 ntfy、聊天机器人或本地脚本。它不是另一道门禁。

## 2. 事件与触发点

事件名是 `on-gate-blocked`，和 `pre-step`、`post-check`、`on-major-decision` 一样，可以来自：

- `.docpath/hooks/on-gate-blocked.sh`（也支持 `.js` / `.mjs` / `.py`）
- `.docpath/config.yaml` 的 `hooks.on-gate-blocked`
- `.docpath/plugins/<name>/` 清单里的同名事件

仓库里的 [docs/examples/hooks/on-gate-blocked.sh](../examples/hooks/on-gate-blocked.sh) 是示例，**不会**被自动执行。复制到 `.docpath/hooks/` 后才生效。

| 门禁 | `DOCPATH_GATE` | 触发时机 |
| --- | --- | --- |
| 脏工作区守卫 | `git-dirty-guard` | `assertCleanWorktreeForNewTask` 或 `assertNoNonDocPathChangesForExecutionStart` 决定抛错之前 |
| `docpath check` | `check` | 协议漂移、任务身份或检查结果判定失败、准备抛出 `docpath check failed` 之前。环境豁免不算阻断 |
| `docpath review` | `review` | 审查结论为不通过，或 `review --approve` 被 review skill gate 挡住之前 |
| 预留：步骤前自审 | `hippo-gate` | 见下一节。当前源码树没有该模块 |

通过的门禁不发这个事件。`post-check` / `post-review` 仍只在原有成功路径上运行。

## 3. 上下文

Hook 同时拿到环境变量和一行 JSON（stdin，末尾带换行）。这和既有生命周期 Hook 的环境变量约定对齐，并把结构化字段放在 stdin 上，避免路径列表塞进不可靠的多行环境变量。

| 变量 | 含义 |
| --- | --- |
| `DOCPATH_HOOK_EVENT` | 固定为 `on-gate-blocked` |
| `DOCPATH_TASK` / `DOCPATH_TASK_ID` | 任务 id。调用方没传时回退到 `state.json` 的 `task_id` |
| `DOCPATH_STEP` / `DOCPATH_CURRENT_STEP` | 步骤。调用方没传时回退到 `current_step` |
| `DOCPATH_GATE` | 上表里的门禁名 |
| `DOCPATH_REASON` | 阻断原因的单行文本（空白折叠，最长 2000 字符） |
| `DOCPATH_PATHS` | 路径的 JSON。脏工作区守卫放入被拦截的路径；其它门禁为 `[]`。过长时变成 `{ "truncated": true, "count", "paths" }` |
| `DOCPATH_CWD` | 命令的工作目录 |
| `DOCPATH_GATE_CONTEXT` | 与 stdin 相同的 JSON。超过 16KB 时不设置，以 stdin 为准 |

stdin 与 `DOCPATH_GATE_CONTEXT` 的形状：

```json
{
  "event": "on-gate-blocked",
  "task_id": "T-20261023-example",
  "gate": "git-dirty-guard",
  "step": "S2",
  "reason": "docpath go: 当前 Git worktree 存在与当前任务无关或无法确认归属的未提交变更，拒绝进入执行步骤。",
  "paths": ["src/app.ts"]
}
```

`reason` 在 JSON 里保留原文。`DOCPATH_REASON` 是通知里方便直接展示的单行形式。

## 4. 失败语义

[emitGateBlocked](../../src/engine/hook-runner.ts) 是门禁使用的唯一出口。它：

- 最多等 **3000ms**（`GATE_BLOCKED_HOOK_TIMEOUT_MS`）。清单里的 `timeout_ms` 只会更短，不会更长。有 GNU `timeout` 时用它杀掉整个进程组，避免 `sleep` / `curl` 这类子进程在超时后继续跑；没有该命令时只结束直接拉起的 shell
- Hook 非零退出、超时、找不到命令时只打一行警告
- 忽略 `fail_fast`。脚本 Hook 默认 `fail_fast: true` 也不会把阻断改成另一种错误，也不会让命令崩溃
- 多个 Hook 全部尝试，一个失败不跳过后面的
- 函数本身不抛错

`docpath hook run on-gate-blocked` 仍是手动调试：失败会体现在报告里，`--strict` 仍会以非零码退出。那条路径不承担门禁结论。

脏工作区守卫在 `src/utils/git-dirty-guard.ts`，按分层不能引用 `src/engine/`。CLI 启动时 [installDirtyGuardBlockHook](../../src/engine/gate-blocked.ts) 注册 [setDirtyGuardBlockListener](../../src/utils/git-dirty-guard.ts)。守卫先算出原来的错误，再同步通知，然后抛出同一个错误。直接调用断言函数、但没有安装监听器时，行为与加这个事件之前一致。

## 5. hippo-gate 预留

本仓库还没有 hippo-gate 模块。步骤前自审一旦落地，阻断分支在返回之前调用：

```ts
await emitGateBlocked(cwd, {
  gate: 'hippo-gate',
  taskId,
  step,
  reason,
});
```

`gate` 必须是 `hippo-gate`。不要根据 Hook 的退出码改变自审结论。不需要再走脏工作区的 listener。

## 6. ntfy 示例

[on-gate-blocked.sh](../examples/hooks/on-gate-blocked.sh) 在 `DOCPATH_NTFY_TOPIC` 为空时直接退出。设置话题后执行：

```bash
curl -fsS -d "$message" "https://ntfy.sh/$DOCPATH_NTFY_TOPIC"
```

消息正文包含 gate、task、step、reason 和 paths。`curl` 失败只会产生 Hook 警告。

## 7. 验证

`tests/gate-blocked-hook.test.mjs` 覆盖：四种门禁名（含预留的 `hippo-gate` API）在阻断时带上任务、步骤、原因和路径；Hook 退出非零或 `sleep` 挂起时，原来的阻断错误或审查状态不变；脏工作区、`check`、`review` 通过时不写 Hook 产物。示例脚本在话题未设置时退出码为 0。
