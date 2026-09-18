## 执行计划

### S1: WT-3/WT-5 合并目标解析统一（shared.ts + closeout.ts）
- [x] S1: WT-3/WT-5 合并目标解析统一（shared.ts + closeout.ts）
- **描述**: 在 `src/commands/worktree/shared.ts` 抽出 `resolveMergeTarget(cwd, explicit?)`（arg → rev-parse 验证 → origin/<x> fallback → CODE_MERGE_TARGET || 'main'），`closeout.ts` 的 merge 与 sync 共用；`getWorktreeDiagnostics` 的 `mergedToMain` 改为对解析后目标做祖先比较。
- **验收条件**: sync 与 merge 同源解析；CODE_MERGE_TARGET 生效；诊断不再依赖主 checkout 当前分支；单测覆盖。
- **依赖**: 无

### S2: WT-4 porcelain 解析健壮化（closeout.ts）
- [x] S2: WT-4 porcelain 解析健壮化（closeout.ts）
- **描述**: dirty-main 文件列表解析改用 `-z` 格式（或状态码感知解析），正确处理 `R  old -> new`（取两侧路径）与带引号路径。
- **验收条件**: rename 与引号路径用例的解析单测通过；重叠判定语义不变。
- **依赖**: 无

### S3: WT-1 merge 失败恢复（closeout.ts）
- [x] S3: WT-1 merge 失败恢复（closeout.ts）
- **描述**: 主仓库 `git merge <branch>` 失败时：捕获 → `git merge --abort`（abort 自身失败则 fail-loud 提示手工恢复）→ 输出冲突文件列表与处置指引（在 feature 分支解冲突后重跑）→ exit 1。
- **验收条件**: 集成测试：构造必然冲突的合并，断言 main 干净（无 MERGE_HEAD）且输出含指引。
- **依赖**: S1

### S4: WT-2 promote 扫描 fail-loud（backlog.ts）
- [x] S4: WT-2 promote 扫描 fail-loud（backlog.ts）
- **描述**: `assertNotActiveInOtherWorktrees` 读其他 worktree state.json 失败/损坏时不再吞错：收集无法验证的工作区列表，存在时 fail-loud（提示手工检查或显式 `--force`？不新增参数，直接要求人工处理）；仅当扫描成功且确认无活跃时放行。
- **验收条件**: 测试：损坏的 state.json 阻断 promote；正常场景行为不变。
- **依赖**: 无

### S5: 全量回归与收口
- [x] S5: 全量回归与收口
- **描述**: 全量测试 + typecheck；P3 限定清理（本次触碰函数的死导入/process.exit）；check/review/journal；merge 收口。
- **验收条件**: 全量测试通过；docpath check 通过。
- **依赖**: S1, S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
