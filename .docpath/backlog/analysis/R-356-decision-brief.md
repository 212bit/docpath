# R-356 决策简报（Decision Brief）：worktree 跨实例共享可见性根治

> 状态：方案待用户确认。**本条目按自身验收要求，实现前必须经 Decision Brief + 用户确认（属重大变更门禁，可能推翻 R-238 Option B / R-273 资源分层）。**

## 1. 问题（当前问题）

多个 Agent 在并行 worktree 中开发不同 feature 时，backlog 的 id 分配与重复登记检测**结构性**看不到兄弟 worktree 的成果，导致：

- **id 撞号**：`nextBacklogId` → `scanBacklogMaxId`（`src/engine/backlog.ts:466`）只扫「本 checkout + 主 checkout」两处（`resolveMainCheckoutDocpathDir`）。两个 worktree 同时 `capture` 时各自取到相同 max，分配出同号 R-id。
- **重复登记（同标题）**：`detectBacklogDuplicates`（`src/engine/backlog.ts:635`）同样只扫本 checkout + 主 checkout 的 active/archived。兄弟 worktree 里已存在的同标题条目不可见，capture 时不提示，产生结构性重复。
- 根因来自 R-273 资源分层：`.docpath/backlog/` 是 **merge-mediated 快照（traced copy）**，可 stale；快照两边收敛只能靠 merge，运行期无实时共享。

## 2. 目标（验收改写，可量化）

> 多 worktree 并行 capture 时，任一会话在**产生** backlog 条目时能感知其他活跃 worktree 已存在的同标题 / 同 id 条目并提示；不再产生结构性重复登记。

## 3. 可选方案

### 方案 A — 共享真源（推翻 R-273 对 backlog 的分层）
把 `.docpath/backlog/` 改为所有 worktree 共享的单一真源（如共享目录 / 符号链接指向共享位置）。
- 优点：最彻底的实时一致性。
- 代价：**推翻 R-238 Option B / R-273** 资源分层；隔离块已明令「禁止 symlink 被 git 跟踪的目录」（git 会把交换记录为 mass deletion，合并回 main 会删除 main 文件）。即使共享真源走 gitignored 路径，也破坏了 merge-mediated 的 reconcile 语义，需重做 backlog 合并策略。
- 判定：**过度改造**，除非未来要求运行期实时后台推送（见方案 C）。

### 方案 B（推荐）— 跨 worktree 扫描 + 共享注册表（保留 R-273 隔离）
最小改动、保留 R-273 隔离（各 worktree 仍持有自己的 merge-mediated backlog，合并回 main 照旧 reconcile）：
1. **扩展扫描面**：`scanBacklogMaxId` 与 `detectBacklogDuplicates` 在解析出主 checkout 后，**额外枚举所有 worktree**（`git worktree list` 已有 `listWorktrees`，`src/utils/worktree.ts`），把每个兄弟 worktree 的 `backlog/` 与 `backlog/archived/` 都纳入扫描。
2. **共享注册表（可选增强，解决「同时 capture 的原子性」）**：维护一个**跨 worktree 共享、gitignored** 的注册表文件，记录 `id → 所属 worktree`、`title → id`。位置选 `.git/docpath-backlog-registry.json`——`.git` 在同一仓库的所有 worktree 间天然共享，且不被 git 当作跟踪文件、不触发 mass-deletion 坑。每次 capture 先读注册表 + 实时扫兄弟 worktree，新登记后写回注册表。
- 优点：满足验收（capture/产生时即可见兄弟 worktree 的同 id/同标题）；不动 R-273 资源分层；改动集中在 `backlog.ts` 两处扫描函数。
- 代价：是**点时刻（point-in-time）**可见性——只在 capture 时探测，不做后台实时推送。验收文字「在产生时提示」已覆盖此语义。
- 判定：**推荐**，风险与改动面最小。

### 方案 C — 事件总线 / broadcast 日志
复用 `docpath worktree broadcast`（已存在，单向通知）或 `docpath worktree matrix`（聚合）Publish 登记事件，各 worktree 维护 peer 日志。
- 问题：broadcast 是单向通知，要可查询仍需一个共享存储 → 实际退化成方案 B 的注册表。除非要求「后台实时推送」（需 watcher/daemon），否则 C 不优于 B。

## 4. 推荐方案与理由

**方案 B**：满足验收、保留 R-273 隔离、改动最小。方案 A 过度改造；方案 C 在缺乏实时后台推送需求时等价于 B 的注册表部分。

## 5. 待用户裁定的三点

1. **方案确认**：采纳方案 B（跨 worktree 扫描 + 可选共享注册表），还是坚持要方案 A 的彻底共享真源？
2. **注册表位置**：推荐 `.git/docpath-backlog-registry.json`（跨 worktree 天然共享、不进跟踪态）；备选仓库根 gitignored `.docpath-shared/`。
3. **实时性下限**：capture 时（点时刻）可见是否足够？还是要求后台实时推送（将升级为方案 C 的 watcher，复杂度显著上升）？

## 6. 不做什么 / 回滚

- 不做：不推翻 R-238/R-273 资源分层（除非用户裁定方案 A）；不引入后台 daemon。
- 回滚：移除注册表写入 + 还原扫描扩展即可回退到 R-273 现状；注册表文件本身 gitignored，删除无副作用。

## 7. 影响面（实现期将补充）

- 改：`src/engine/backlog.ts` 的 `scanBacklogMaxId`、`detectBacklogDuplicates`（含 `roots` 聚合段）。
- 新增（方案 B 增强）：共享注册表读写原语（建议放 `src/utils/backlog-registry.ts`，并在 `src/utils/README.md` 域分类法登记，满足 R-305 测试门禁）。
- 测试：跨 worktree 的 id 撞号 / 同标题去重回归（需在 `tests/` 用 `listWorktrees` 真实建兄弟 worktree，注意 R-349 测试隔离：init 类用例共享 `~/.docpath/projects.sqlite` 偶发竞态——必要时串行或加锁）。
