# R-362 分析：check 测试执行优化包落地状况

## 实现归属

R-362 的功能实现已随提交 **dfd1287**（`feat(check): --test-scope 测试减载与 quick-guard 路径 bugfix`，作者 fu.yf）合入 main，并已通过 check 全量门禁与 review（提交信息记载 `check 全量门禁(+review pass_with_skips)已通过`）。该提交未走 backlog 条目级 `promote → done` 闭环，故 `links.task` 长期为空，本次为补验收 + 生命周期收口。

## 已实现能力（对应验收）

1. **影响面减载（--test-scope=touched）**：`src/commands/check/test-scope.ts` 的 `selectTouchedTestFiles`。按 git 改动匹配相关测试文件；触及 `RISKY_PATH_PATTERNS`（命令主文件、check/worktree 子模块、engine、核心 utils、package.json、锁文件、tsconfig）时强制回落全量（`null`），宁慢不放水。提交信息实测叶子改动 80s → 14s。
2. **受控并发 + 进程隔离（--test-scope=full / 默认）**：`resolveTestCommand` 注入 `--test-concurrency=<n>`（`computeTestConcurrency`：cpu/2，范围 2–8）与 `--test-isolation=process`，消除全并发摊薄与 `~/.docpath/projects.sqlite` 竞态重试。
3. **quick-guard 路径 bug 修复**：`src/engine/quick-guard.ts` 的 `readChangedFiles`。旧实现先 `trim()` 再 `slice(3)`，把 tracked 修改 `` M src/...`` 错切成 `rc/...`，致核心路径 `RISKY_PATH_PATTERNS` 匹配失效、风险复评漏判。修复为 `trimEnd()` 后 `slice(3)`。提交信息新增 tracked-modified 回归测试。
4. **接入点**：`src/commands/check/runners.ts:474` 在 `options.testScope !== undefined` 时调 `resolveTestCommand`；`src/commands/register/quality.ts` 暴露 `--test-scope <scope>` 选项；`src/commands/check/types.ts` 增加 `testScope` 字段。

## 回归测试

- `tests/test-scope.test.mjs`：并发数、影响面匹配、安全回落、命令构建（9 用例）。
- `tests/quick.test.mjs`：含 `R-3xx regression: porcelain slice offset`（tracked 核心文件修改回落全量）用例。

## 结论

R-362 功能与修复均已在 dfd1287 落地并有回归测试覆盖。本次任务范围为：补全条目 `## 验收` 标准、提升成熟度至 analyzed、走 `promote → go → check → review → journal → done` 标准生命周期收口，把实现与条目绑定闭环。
