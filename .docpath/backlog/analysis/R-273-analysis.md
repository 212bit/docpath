# R-273 分析: backlog 共享契约冲突与 symlink 合并数据丢失

## 复现 (2026-07-16, scratch 仓)

1. git track `.docpath/backlog/R-1.md` (模拟本仓 102 个 tracked 文件现状)
2. `docpath worktree create wt1` → R-271 的 forceLiveShared 把 tracked 目录换成 symlink
3. worktree 内 `git status`: `D .docpath/backlog/R-1.md` + `?? .docpath/backlog`
4. `git add -A && git commit` (agent 惯用; worktree merge FR-2 亦自动执行)
   → 提交记录: `.docpath/backlog | 1 +` (symlink blob), `R-1.md | 6 ------`
5. main 执行 `git merge wt1` → **R-1.md 被删除**, `.docpath/backlog` 变为
   `SYMLINK -> ../../../.docpath/backlog` (从 main 解析越出仓库, 悬空)

## 契约考古

| 时间 | 提交/条目 | 契约 |
| --- | --- | --- |
| 2026-06-19 | 80ef439 (option C S1) | untrack + gitignore, live-shared symlink |
| 2026-06-30 | 7b3f9f0 (R-238, 用户确认 Option B) | 有意翻回 merge-mediated tracked, 删 ignore 规则 |
| 2026-07-16 | ef1be38 (R-271) | 按过时 CLAUDE.md 强制 symlink, 未引用 R-238 |

根因: 三个决策打架 + CLAUDE.md 未随 R-238 更新 (至今仍写 live-shared/gitignored),
导致 R-271 会话在文档漂移下做出与最近用户确认 ADR 相反的实现。

## 方案对比 (2026-07-16 用户裁定: B)

- A 回 Option C (untrack+gitignore): 终态干净, 但推翻 R-238、backlog 退出 git
  历史/克隆可得性, 需适配 changes --agent 与 9 个旧 worktree 冲突迁移。
- **B 回滚 R-271 symlink (选定)**: 最小安全修复, 尊重 R-238; id 撞号以跨
  checkout 分配器解决; stale 快照降级为已知限制。
- D 命令层 live-share: 两全但等于新特性, 应走完整 brainstorm (记录备将来)。

## 测试缺口 (为何 R-271 测试未拦截)

worktree 测试夹具的 backlog 未被 git track (docpath init 不建 backlog 目录),
tracked 场景从未进入用例; 合并回 main 的链路无测试。本次补 AC-1~AC-3 回归。
