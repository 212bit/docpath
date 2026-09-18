## 执行计划

### S1: 包 1 五项实测摩擦（W1/W2/R1/R2/R3）
- [x] S1: 包 1 五项实测摩擦（W1/W2/R1/R2/R3）
- **描述**: next 漂移提示去重（workspace 记录已提示 sha）；drift_lock 与 transition 错误消息按类型给直接修复命令；review 补 --non-interactive；current_diff 干净时 skill gate 自动 pass_with_skips；review 结果消息区分 baseline 警告并点名阻塞原因。
- **验收条件**: 八项行为变更各有对应测试或 CLI 可观测断言
- **依赖**: 无

### S2: A1 git 共享原语（utils/git-run.ts + 12 文件迁移）
- [x] S2: A1 git 共享原语（utils/git-run.ts + 12 文件迁移）
- **描述**: 新建 runGit/runGitAsync/runGitOptional（quotePath=false + timeout + capture），迁移 git-dirty-guard/major-change/worktree/review-skill-router/ceremony/git-closeout/git-staging/git-hygiene/structured-heal/write-review-skill/review/scan-existing-tree/check-evidence 的本地 git helper。
- **验收条件**: 12 文件本地 git helper 全部迁移至 git-run.ts；quotePath 全局生效；测试绿
- **依赖**: S1

### S3: W3 步骤收尾路径收敛
- [x] S3: W3 步骤收尾路径收敛
- **描述**: go finalizeStep 与 agent step 的 runCommand(action:'end') + plan sync 收敛为单一 runtime 原语，行为不变。
- **验收条件**: go --status 与 agent step 共用同一 end 原语；同步行为不变；测试绿
- **依赖**: S1

### S4: A2 worktree.ts 拆分
- [x] S4: A2 worktree.ts 拆分
- **描述**: 拆为 commands/worktree/ 子目录（create/remove/doctor/merge/sync/list/共享诊断），worktree.ts 保留 worktreeCommand 入口 re-export；CLI 注册与测试不受影响。
- **验收条件**: worktree.ts 降为入口 re-export；CLI 行为不变；测试绿
- **依赖**: S2

### S5: 验证与收口
- [x] S5: 验证与收口
- **描述**: 全量 typecheck/test/check/review + commit/merge。
- **验收条件**: 全量套件全绿；八项优化行为可在 CLI 实测观察
- **依赖**: S1,S2,S3,S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
