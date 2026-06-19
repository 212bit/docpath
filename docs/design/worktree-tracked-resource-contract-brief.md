# Decision Brief: Worktree 跟踪资源契约修复

> 状态：**待确认**（pre-implementation）
> 范围：`.docpath` 共享/隔离资源在 git worktree 下的数据契约
> 触发：`worktree create` 在本仓库实测暴露契约破坏（见诊断证据）

## 背景

DocPath worktree 的设计契约（`CLAUDE.md` + `docs/features/worktree-workflow.md`）：

| 资源 | 契约 | 机制 |
| --- | --- | --- |
| `backlog` `rules` | **共享**（global view） | symlink 到主仓 |
| `workspace` `tasks` `journal` | **隔离**（每 worktree 独立运行时） | 独立目录 |

commit `09c6e0d`「preserve tracked docpath files in worktrees」为消除"创建即产生 git 噪声"（symlink 替换被跟踪目录 → 显示为 deleted），改为：**被 git 跟踪的资源保留为副本，仅未跟踪资源才 symlink**。这在合成测试仓库里（什么都不 track）绿，但在本仓库里静默破坏了契约。

## 问题证据（本仓库实测）

本仓库 git 跟踪情况：`backlog` `rules` `tasks` `docs.md` `docs-index.json` 被 track；`workspace` `journal` `spec` `templates` 未 track。

`docpath worktree create probe-wt` 实测结果：

1. **共享资源不再共享**：`backlog`/`rules` 走 `tracked → cp` 分支，成为**静态快照副本**，非 symlink。主仓 promote 一个 backlog 条目，worktree 看不到；反向亦然。"全局需求池"目标失效。`doctor` 把 `shared backlog resource: tracked copy` 判为 ✅ pass，掩盖破坏。
2. **`tasks` 不再隔离**：`tasks` 被跟踪 → 保留 tracked 副本。worktree 里跑 `docpath quick`/`backlog promote` 改动**被跟踪的** `tasks/`，产生 git diff，合回 main 时与 main 的 `tasks/` 演进冲突。`doctor` 仍标 `isolated tasks directory` ✅，名不副实。
3. **运行时重定向是死代码**：`src/utils/worktree.ts` 的 `resolveSharedResource`/`getMainRepoPath`/`isInWorktree` 在 `worktree.ts` 之外零调用。`backlog.ts` 用 `resolveDocpathDir(cwd)` 按 cwd 解析 → 读 worktree 副本。原始"symlink + 运行时重定向"设计已废弃但未拆，是地雷。
4. **`merged_to_main` 语义误导**（非致命）：`getWorktreeDiagnostics` 用 `merge-base --is-ancestor`，新建 worktree（HEAD==main）也判 `merged_to_main: true`。因 `safe_to_remove` 还要求 `completed`，不会误删，但标签误导。

根因：**被跟踪的 docpath 资源无法同时满足"git 干净"和"共享/隔离"**。`09c6e0d` 选了前者，静默牺牲后者。

## 修复选项

### 选项 A：停止跟踪运行态共享/隔离资源（推荐方向）

把"应共享"和"应隔离"的资源从 git 跟踪中移出，让 symlink/独立目录机制重新生效。

- `backlog` `rules` → gitignore + symlink 到主仓（真共享）
- `tasks/current/` → gitignore（worktree 独占隔离）；`tasks/done/` 保留跟踪（历史可合并）
- 代价：需迁移 `.gitignore` + `git rm --cached` 已跟踪内容；`backlog`/`rules` 不再进版本库（但它们本就是运行态，主仓仍有本地真值）
- 风险：`backlog`/`rules` 不再被 git 备份，需确认是否有外部同步机制；团队协作下"不跟踪 backlog"需达成共识

### 选项 B：承认"共享 = 合并中介"，修正文档与诊断

保留 `09c6e0d` 的 tracked-copy 策略，但诚实化：

- 改 `CLAUDE.md`/`worktree-workflow.md`：共享资源在 worktree 下是"分支快照 + 合并中介"，非实时 symlink
- `doctor` 区分 `shared: live-symlink` vs `shared: tracked-snapshot`，后者降为 ⚠️ warn 并提示"主仓变更不会实时同步"
- `tasks`：明确 worktree 内 `tasks/current/` 是隔离副本（仍需解决 tracked 冲突 → 至少 `tasks/current/` gitignore）
- 代价：小；但放弃了"真并发全局需求池"的实时性目标

### 选项 C：混合 — 按子目录拆分跟踪策略

- `backlog/`：整体 gitignore + symlink（真共享）
- `rules/`：保留跟踪（rules 变更频率低，合并中介可接受）+ 修文档
- `tasks/current/`：gitignore（隔离）；`tasks/done/`：保留跟踪
- `workspace/` `journal/`：保持现状（已 gitignore 等价）
- 代价：中；最贴合"各资源按语义分别处理"，但策略表更复杂

## 推荐

**选项 C**（混合）。理由：

- `backlog` 是 worktree 并发的核心全局视图，必须真共享 → symlink + gitignore。
- `rules` 变更稀少、且本就该全仓一致 → 合并中介可接受，避免 gitignore 后规则丢失备份。
- `tasks/current/` 必须隔离才能避免并发冲突 → gitignore；`tasks/done/` 是历史归档，跟踪+合并正确。
- 同时拆掉死代码 `resolveSharedResource` 等（或按选项 B 诚实化诊断）。
- 修正 `doctor`：`shared` 资源只对真 symlink 判 pass，tracked copy 降级 warn；`isolated tasks` 只对 gitignored `tasks/current/` 判 pass。

## 影响与边界

- **数据契约变更**：`.gitignore` + `git rm --cached` 涉及 `backlog/`、`tasks/current/`。需一次性迁移提交。
- **向后兼容**：已存在的 worktree（本仓刚清理完，暂无）不受影响；新 worktree 按新契约。
- **doctor/check 语义**：诊断输出会变化，需同步更新 `tests/worktree.test.mjs`（合成仓库需调整为 track 真实子集以覆盖新分支）。
- **文档**：`CLAUDE.md` worktree 表格、`docs/features/worktree-workflow.md` 需同步。
- **不在本次范围**：`merged_to_main` 语义重命名（可顺带修，低优先）；批量 `worktree prune` 命令（另议）。

## 待用户确认

1. 选 A / B / C 哪个方向？
2. `backlog` 不进 git 是否可接受？（选项 A/C 涉及）
3. 确认后是否走完整 DocPath 流程（brainstorm → spec → plan → implement）落地，还是按 quick profile 直接修？
