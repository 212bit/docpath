# T-20260716-r-271-tracked-backlog-symlink-worktree-m - R-271 后续: tracked backlog 被 symlink 替换后, worktree 合并回 main 会删除 backlog 并留下悬空 symlink

> backlog_id: R-273
> backlog_source: docpath backlog capture

## 1. 背景与动机

2026-07-16 review R-271 (ef1be38) 时 scratch 仓实测复现数据丢失链: 本仓 102 个
backlog/*.md 被 git track (R-238 Option B 有意决策, 7b3f9f0); R-271 按过时
CLAUDE.md (仍写 live-shared/gitignored) 强制把 tracked 的 .docpath/backlog 换成
symlink → worktree 内全量显示 deleted; git add -A (agent 惯用 / worktree merge
FR-2 自动提交) 把删除+symlink 记入提交; 合回 main 后 backlog/*.md 被删除,
.docpath/backlog 成悬空 symlink。

契约考古: 6/19 Option C untrack 落地 (80ef439) → 6/30 R-238 用户确认翻回
Option B (merge-mediated tracked) → R-271 未引用 R-238 再翻回 symlink。根因:
契约三方打架 + CLAUDE.md 未随 R-238 更新。分析证据:
.docpath/backlog/analysis/R-273-analysis.md。

2026-07-16 用户裁定方案 B: 回滚 R-271 强制 symlink, 契约最终定为 R-238
Option B; id 撞号改由跨 checkout 分配器解决; stale 快照降级为已知限制。

## 2. 需求清单

### 功能需求

- [x] FR-1: worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。
- [x] FR-2: worktree doctor 对 backlog 恢复 merge-mediated 检查; symlink 形态报 FAIL 并提示 docpath worktree repair (与 R-271 的 checkLiveShared 反向)。
- [x] FR-3: backlog id 分配跨 checkout 单池: worktree 内 capture/add 经 resolveWorktreeManagerRoot 同时扫描 main checkout 的 backlog/ 与 backlog/archived/ 取全局 max+1; 非 worktree 或 root 解析失败时回退现行为。
- [x] FR-4: CLAUDE.md worktree 章节更正为 Option B 真相 (backlog merge-mediated tracked; id 单池在 CLI 层; stale 快照为已知限制), 与 .gitignore 注释对齐。
- [x] FR-5: 归档 R-271 条目补 superseded-by R-273 注记; 决策日志记录契约裁定 (R-273 恢复 R-238, 覆盖 R-271 symlink 契约)。

### 非功能需求

- [x] NFR-1: 非 worktree 场景 (主 checkout 直接 capture/add) 的 id 分配与命令行为不变。
- [x] NFR-2: 不动 rules/tasks-done 的 merge-mediated 策略与其 doctor 检查。
- [x] NFR-3: 不实现 stale 快照 live 一致性与 git merge driver (记为既有缺口, 范围外)。

## 3. 范围界定

### 包含
- src/commands/worktree.ts (create/repair/doctor 的 backlog 分支)
- backlog id 分配器 (backlog.ts 或其 utils) 跨 checkout 扫描
- CLAUDE.md worktree 章节、archived/R-271.md 注记
- 回归测试: tracked backlog 场景 create/status/merge 链、doctor/repair、id 分配

### 不包含
- stale 快照 live 一致性 (用户接受已知限制; 命令层 live-share 候选设计留档分析文件)
- git merge driver (R-238 提及但从未实现, 既有缺口)
- worktree merge FR-2 的 add -A 排除 (Option B 下副本编辑本就应提交)

## 4. 关键决策 (用户确认)

- 方案 B (2026-07-16 用户裁定): 最小安全修复, 尊重最近用户确认的 R-238;
  不选 A (untrack, 推翻 R-238) 与 D (命令层 live-share, 新特性)。
- 回滚方案: 回滚本任务提交即回到 R-271 形态 (P0 复活, 不建议)。

## 4.1 重大变更门禁
### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 数据契约 (backlog 共享/跟踪模型)
- [x] 工作流行为 (worktree create/repair/doctor)

### Decision Brief
- 当前问题: R-271 强制 symlink 覆盖 tracked backlog, 合并回 main 会删除 backlog 并留悬空 symlink (P0, 已复现)
- 目标: backlog 共享契约最终裁定并消除数据丢失链
- 可选方案: A untrack 回 Option C; B 回滚 R-271 symlink 维持 R-238 Option B; D 命令层 live-share
- 推荐方案: 方案 B
- 决策理由: 最小安全修复, 尊重最近一次用户确认的 R-238; id 撞号以跨 checkout 分配器解决; stale 快照降级为已知限制
- 不做什么: 不 untrack main backlog; 不做 stale live 一致性; 不实现 git merge driver
- 成本: 中 (worktree.ts 回退 + id 分配器 + 测试与文档更正)
- 风险: 旧 worktree 的 symlink 残留需 repair 收敛; main 侧分配对 worktree 本地预留不可见 (已知不对称)
- 回滚方案: 回滚本任务提交 (回到 R-271 形态, P0 复活, 不建议)
- 用户确认: 2026-07-16 AskUserQuestion 选定「回滚 R-271 symlink (推荐)」= 方案 B

## 5. 验收标准

- [x] AC-1: scratch 仓 tracked backlog + worktree create → backlog 为目录副本且 git status 无 backlog 删除噪声; 复现链 (worktree 内 add -A 提交 + main merge) 不再删除 main 的 backlog 文件。
- [x] AC-2: doctor 对副本 backlog pass, 对 symlink backlog fail; repair 将 symlink 转回 tracked 副本。
- [x] AC-3: worktree 内 capture 分配 id = max(本地, main backlog/ + archived/)+1; 主 checkout 分配行为不变。
- [x] AC-4: CLAUDE.md 与 .gitignore 注释一致声明 Option B; R-271 归档注记与 ADR 落盘。
- [x] AC-5: 新增/更新回归测试覆盖 AC-1~AC-3 (含 R-271 原 symlink 断言更新为 Option B 语义), pnpm test 全绿。
