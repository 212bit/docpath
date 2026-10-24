---
title: 外部命令执行器
kind: architecture
scope: runtime
level: 2
status: active
tags:
  - child-process
  - timeout
  - npm
related:
  - features/lifecycle-hooks.md
summary: 外部命令只经 run-tool 执行。每次调用都有超时，stdin 默认不继承，npm/npx 默认离线，命令缺失和超时返回结构化结果。
---

# 外部命令执行器

## 1. 问题背景与动机

`src` 里曾经有几十处各自调用 `execSync` / `spawnSync` / `exec` / `execFile`。超时不统一：有的 3 秒，有的 10 秒，有的完全没有。没有超时的 `npx tsc` 会在沙箱里尝试访问 registry 安装 TypeScript，进程一直挂起，检查门禁无法返回。

交互式程序还会继承终端 stdin，停在确认提示上，直到外层超时（如果有的话）才被杀掉。

## 2. 架构与不变量

唯一实现是 `src/utils/run-tool.ts` 的 `runToolSync` / `runTool`（以及 shell 包装 `runShellSync` / `runShell`）。`src/utils/git-run.ts` 的 `gitSync` / `gitAsync` 是它上面的薄包装，继续负责 `core.quotePath=false`、10 秒超时和 10MB buffer。

不变量：

- 每次执行都有超时。缺省 `DEFAULT_RUN_TIMEOUT_MS`（30 秒）。调用方用 `timeoutMs` 覆盖；传 0 或负数会抛错，不能关掉超时。已有超时的调用点保持原值。
- stdin 默认 `ignore`。只有 `stdin: 'inherit'`（例如 `test-map` 把测试输出打到终端）或传入 `input`（hook 的 JSON）时才把数据交给子进程。
- `ENOENT` / `ENOTDIR`，以及 bash、dash、busybox 的 “command not found / not found” 文案，结果是 `status: 'environment_failure'`。文案判定复用 `looksLikeEnvironmentFailure`（`src/utils/environment-failure.ts`，`src/commands/check/runners.ts` 再导出）。
- 超时结果是 `status: 'timeout'`，`timedOut: true`。不把挂起伪装成普通非零退出。
- 命令名是 `npm` / `npx`，或 shell 字符串在命令位置调用它们时，默认设置 `npm_config_offline=true`。argv 形式的 `npx` 还会在参数前加上 `--offline`（`--no-install` 的现行语义：缺包直接失败，不访问 registry）。`offline: false` 可以关掉。已经设置的 `npm_config_offline` 不会被自动覆盖。
- 非零退出且不属于上面两类时，`status: 'error'`。`runToolSyncOrThrow` / `runToolOrThrow` 抛 `RunToolError`，带 `stdout`、`stderr`、`code`、`status`，原有 `try/catch` 仍把失败当失败。

`tests/run-tool.test.mjs` 扫描 `src`。除 `src/utils/run-tool.ts` 外，再出现 `child_process` 的 `exec` / `execSync` / `execFile` / `execFileSync` / `spawn` / `spawnSync` 导入（含动态 `import()`）即失败。允许名单已清空并删除，没有剩余例外。

## 3. 边界

`src` 不再保留 raw `child_process` 例外。`src/utils/docs-doctor.ts` 的 `runDocsDoctorGit` 执行两条原先的 git 命令：暂存列表是 `git diff --cached --name-only`，自愈后重新暂存是 `git add -- <paths>`（argv 形式，对应原来 shell 引号包住的路径）。这两处原先没有超时，现在显式使用 `DEFAULT_RUN_TIMEOUT_MS`。stdin 为 `ignore`。`git` 不是 npm/npx，调用显式 `offline: false`，不注入 `npm_config_offline`。

命令缺失时结果是 `environment_failure`（argv 下为 `ENOENT`），超时是 `timeout`。docs-doctor 仍把这两种失败当成「读不到暂存区 / 重新暂存失败」：`getStagedFiles` 返回空列表，重新暂存失败被吞掉。体检报告正文不变。

`git diff` 保持原来的参数，不追加 `core.quotePath=false`，避免 CJK 路径的输出格式变化。需要 quotePath 的调用继续走 `gitSync`。

## 4. 验证

`tests/run-tool.test.mjs` 覆盖超时、ENOENT、dash 的 `not found`、离线环境变量，并禁止 `run-tool` 之外的 `child_process` 导入。`tests/docs-doctor-git.test.mjs` 覆盖 docs-doctor 的超时与命令缺失。检查 runner、Hippo 门禁和 hook runner 的原有超时与失败分支保持不变。
