## 执行计划

### S1: resolveIndexConflicts 共享解析器 + config 扩展
- [x] S1: resolveIndexConflicts 共享解析器 + config 扩展
- **描述**: 在 `src/commands/worktree/shared.ts` 新增 `resolveIndexConflicts(cwd, unmergedFiles)`：内置可重建集合 {`.docpath/docs-index.json` → docs scan, `.docpath/backlog/backlog.md` → backlog refresh}，config `worktree.auto_resolve_paths` 追加扩展（命中 backlog.md 模式走 backlog 重建，其余仅登记消解不做内容重建——扩展项默认只对已知索引生效）；all-or-nothing 语义。`src/types/config.ts` 增加类型。
- **验收条件**: 纯调度逻辑单测：全命中/部分命中/空输入三态。
- **依赖**: 无

### S2: 接线收口方向（FR-2/FR-7）与同步方向（FR-3）
- [x] S2: 接线收口方向（FR-2/FR-7）与同步方向（FR-3）
- **描述**: `closeout.ts` 收口方向 catch：WT-1 mid-merge 检测前先尝试 resolveIndexConflicts → 成功则 add+commit 完成合并并输出审计行，失败维持 abort 恢复。同步方向 catch：同样先尝试自动消解（worktree 内 add+commit 完成合并），不可消解时改为 abort + 指引退出（不再遗留 mid-merge）。
- **验收条件**: 两条路径的消解/回退分支均有集成测试。
- **依赖**: S1

### S3: 集成测试与全量回归
- [x] S3: 集成测试与全量回归
- **描述**: 测试：双侧修改 docs-index.json/backlog.md 制造冲突 → worktree merge 自动消解成功；混入普通文件冲突 → 不消解且现场干净（无 MERGE_HEAD）；同步方向同构用例。全量测试 + typecheck。
- **验收条件**: AC-1..AC-4 全部落地。
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
