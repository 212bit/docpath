## 执行计划

### S1: 梳理 worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。
- [x] S1: 梳理 worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。
- **描述**: 根据 spec 明确 FR-1: worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。 的实现边界和验收口径。
- **验收条件**: AC-1: scratch 仓 tracked backlog + worktree create → backlog 为目录副本且 git status 无 backlog 删除噪声; 复现链 (worktree 内 add -A 提交 + main merge) 不再删除 main 的 backlog 文件。
- **依赖**: 无

### S2: 实现 worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。
- [x] S2: 实现 worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。
- **描述**: 在现有架构内完成 FR-1: worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。 的代码与文档更新。
- **验收条件**: FR-1 worktree create/repair 撤销 forceLiveShared——backlog 与 rules/spec/templates 同走 tracked→目录副本分支; 现存 symlink 形态的 backlog 经 repair 转回 tracked 副本 (从 main checkout 复制)。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 worktree doctor 对 backlog 恢复 merge-mediated 检查; symlink 形态报 FAIL 并提示 docpath worktree repair (与 R-271 的 checkLiveShared 反向)。
- [x] S3: 实现 FR-2 worktree doctor 对 backlog 恢复 merge-mediated 检查; symlink 形态报 FAIL 并提示 docpath worktree repair (与 R-271 的 checkLiveShared 反向)。
- **描述**: 在现有架构内完成 FR-2: worktree doctor 对 backlog 恢复 merge-mediated 检查; symlink 形态报 FAIL 并提示 docpath worktree repair (与 R-271 的 checkLiveShared 反向)。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 backlog id 分配跨 checkout 单池: worktree 内 capture/add 经 resolveWorktreeManagerRoot 同时扫描 main checkout 的 backlog/ 与 backlog/archived/ 取全局 max+1; 非 worktree 或 root 解析失败时回退现行为。
- [x] S4: 实现 FR-3 backlog id 分配跨 checkout 单池: worktree 内 capture/add 经 resolveWorktreeManagerRoot 同时扫描 main checkout 的 backlog/ 与 backlog/archived/ 取全局 max+1; 非 worktree 或 root 解析失败时回退现行为。
- **描述**: 在现有架构内完成 FR-3: backlog id 分配跨 checkout 单池: worktree 内 capture/add 经 resolveWorktreeManagerRoot 同时扫描 main checkout 的 backlog/ 与 backlog/archived/ 取全局 max+1; 非 worktree 或 root 解析失败时回退现行为。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 CLAUDE.md worktree 章节更正为 Option B 真相 (backlog merge-mediated tracked; id 单池在 CLI 层; stale 快照为已知限制), 与 .gitignore 注释对齐。
- [x] S5: 实现 FR-4 CLAUDE.md worktree 章节更正为 Option B 真相 (backlog merge-mediated tracked; id 单池在 CLI 层; stale 快照为已知限制), 与 .gitignore 注释对齐。
- **描述**: 在现有架构内完成 FR-4: CLAUDE.md worktree 章节更正为 Option B 真相 (backlog merge-mediated tracked; id 单池在 CLI 层; stale 快照为已知限制), 与 .gitignore 注释对齐。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 归档 R-271 条目补 superseded-by R-273 注记; 决策日志记录契约裁定 (R-273 恢复 R-238, 覆盖 R-271 symlink 契约)。
- [x] S6: 实现 FR-5 归档 R-271 条目补 superseded-by R-273 注记; 决策日志记录契约裁定 (R-273 恢复 R-238, 覆盖 R-271 symlink 契约)。
- **描述**: 在现有架构内完成 FR-5: 归档 R-271 条目补 superseded-by R-273 注记; 决策日志记录契约裁定 (R-273 恢复 R-238, 覆盖 R-271 symlink 契约)。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 验证验收标准
- [x] S7: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: scratch 仓 tracked backlog + worktree create → backlog 为目录副本且 git status 无 backlog 删除噪声; 复现链 (worktree 内 add -A 提交 + main merge) 不再删除 main 的 backlog 文件。；AC-2: doctor 对副本 backlog pass, 对 symlink backlog fail; repair 将 symlink 转回 tracked 副本。；AC-3: worktree 内 capture 分配 id = max(本地, main backlog/ + archived/)+1; 主 checkout 分配行为不变。；AC-4: CLAUDE.md 与 .gitignore 注释一致声明 Option B; R-271 归档注记与 ADR 落盘。；AC-5: 新增/更新回归测试覆盖 AC-1~AC-3 (含 R-271 原 symlink 断言更新为 Option B 语义), pnpm test 全绿。
- **验收条件**: AC-1: scratch 仓 tracked backlog + worktree create → backlog 为目录副本且 git status 无 backlog 删除噪声; 复现链 (worktree 内 add -A 提交 + main merge) 不再删除 main 的 backlog 文件。；AC-2: doctor 对副本 backlog pass, 对 symlink backlog fail; repair 将 symlink 转回 tracked 副本。；AC-3: worktree 内 capture 分配 id = max(本地, main backlog/ + archived/)+1; 主 checkout 分配行为不变。；AC-4: CLAUDE.md 与 .gitignore 注释一致声明 Option B; R-271 归档注记与 ADR 落盘。；AC-5: 新增/更新回归测试覆盖 AC-1~AC-3 (含 R-271 原 symlink 断言更新为 Option B 语义), pnpm test 全绿。
- **依赖**: S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7
