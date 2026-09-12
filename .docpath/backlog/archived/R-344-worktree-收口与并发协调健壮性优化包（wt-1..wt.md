---
id: R-344
title: worktree 收口与并发协调健壮性优化包（WT-1..WT-5）
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260912-worktree-wt-1-wt-5/spec.md
  decision_brief: worktree 功能审查（会话内 Decision Brief，2026-09-12）
  user_confirmed: 用户于 2026-09-12 会话中审查结论后明确回复'同意'捕获并实施
links:
  task: T-20260912-worktree-wt-1-wt-5
  spec: tasks/T-20260912-worktree-wt-1-wt-5/spec.md
created_at: 2026-09-12
---

# Decision Brief: worktree 收口与并发协调健壮性优化包

## 背景

对 worktree 功能的全面审查（代码调研 + R-338 全流程实战）结论：隔离策略与生命周期设计合理，但存在两个真实风险点（P1）和三处一致性/健壮性问题（P2），另有卫生问题若干（P3，顺带清理）。

## 问题清单

### P1（必须修）

- **WT-1 merge 失败留下 mid-merge 现场**：`src/commands/worktree/closeout.ts:301-304` 在主仓库执行 `git merge <branch>` 失败时直接 `process.exit(1)`，不执行 `git merge --abort`。main 停在冲突未解的合并中间态，后续所有任务被 dirty guard 卡住。修复：失败时 abort 并输出冲突文件列表与处置指引；或至少在输出中明确"main 已处于 mid-merge"并给出恢复命令。

- **WT-2 promote 跨 worktree 防重 TOCTOU + 静默吞错**：`src/commands/backlog.ts:1007-1032` 无锁扫描其他 worktree 的 state.json 判断条目活跃性，并发 promote 同一条目可双双通过；catch 块（:1030-1031）静默吞掉非预期错误。修复：扫描失败（state.json 不可读/损坏）时 fail-loud 列出无法验证的 worktree，要求人工确认或跳过参数；并发窗口风险在输出中提示（初版不做跨进程锁，见备选）。

### P2（本包一并修）

- **WT-3 sync 目标硬编码 main**：`closeout.ts:21-66` 的 `worktree sync` 硬编码 `git merge main`，与 `worktree merge` 尊重 `CODE_MERGE_TARGET` 不一致。统一走同一目标解析逻辑。

- **WT-4 porcelain 解析脆弱**：`closeout.ts:241-244` 用 `line.slice(3)` 解析 dirty 文件，rename 条目（`R  old -> new`）与带引号路径解析错误，影响 dirty-main 重叠判定。改用 `-z` 格式或按状态码正确解析。

- **WT-5 mergedToMain 诊断失真**：`src/commands/worktree/shared.ts:216-223` 与主 checkout *当前所在*分支做祖先比较；主 checkout 临时切分支时 `safe_to_remove`/`prune` 判断失真。改为与解析后的合并目标（同 WT-3 的目标解析）比较。

### P3（顺带清理，不设验收）

worktree 五模块死导入清理、错位注释归位、库函数 `process.exit` 改抛错（仅限本次触碰的函数）、`DOCPATH_WORKTREE` env 后门文档化或删除、repair 补建 node_modules 软链。

## 备选方案

- 方案 A（采用）：如上按 WT-1..WT-5 逐项修复；WT-2 初版只做 fail-loud，不引入跨进程锁。
- 方案 B：为 promote 引入跨 worktree 文件锁 —— 彻底消除 TOCTOU，但锁的粒度与死锁风险需单独设计，成本不成比例，推迟到真实并发事故后再议。
- 方案 C：P2 降级为 backlog 不修 —— sync/诊断失真在非 main 主分支项目里是正确性问题，不采纳。

## 验收

- AC-1: 主仓库 merge 失败时执行 `git merge --abort`（或等价恢复），main 不残留 mid-merge 状态，输出冲突文件与处置指引；有测试覆盖。
- AC-2: 其他 worktree state.json 不可读/损坏时，promote fail-loud 并列出无法验证的工作区；有测试覆盖。
- AC-3: `worktree sync` 与 `worktree merge` 使用同一合并目标解析（含 CODE_MERGE_TARGET）。
- AC-4: dirty 文件解析正确处理 rename 条目与带引号路径；有测试覆盖。
- AC-5: `mergedToMain`/`safe_to_remove` 诊断基于解析后的合并目标而非主 checkout 当前分支；有测试覆盖。
- AC-6: 全量测试套件通过，`docpath check` 门禁通过。
