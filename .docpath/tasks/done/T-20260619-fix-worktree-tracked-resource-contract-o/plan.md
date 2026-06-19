## 执行计划

### S1: 迁移跟踪策略（backlog + tasks/current 解除跟踪）
- **描述**: 修改 `.gitignore` 加入 `.docpath/backlog/` 与 `.docpath/tasks/current/`；执行 `git rm -r --cached .docpath/backlog .docpath/tasks/current` 解除跟踪（保留本地文件）；单独提交迁移。前置：确认主仓 backlog/tasks/current 本地真值完好。
- **验收条件**: `git ls-files .docpath/backlog .docpath/tasks/current` 为空；主仓 `.docpath/backlog/`、`.docpath/tasks/current/` 本地文件仍在；`git status` 仅显示已暂存的解跟踪变更。
- **依赖**: 无

### S2: 重写 initWorktreeDocpath 共享/隔离逻辑
- **描述**: 在 `src/commands/worktree.ts` `initWorktreeDocpath` 中：`backlog` 现已未跟踪 → symlink 到主仓（真共享）；`rules` 保留 tracked copy（合并中介）；`tasks/current` 现已未跟踪 → 独立目录（隔离），`tasks/done` 保留 tracked copy；`workspace`/`journal` 维持独立。更新 `toClean`/`sharedResources` 分支判断，使其基于"是否当前跟踪"而非硬编码。
- **验收条件**: 新建 worktree 后 `backlog` 为 symlink 指向主仓；`tasks/current` 为独立空目录；`rules`/`tasks/done` 为 tracked copy；`git status` 干净无噪声。
- **依赖**: S1

### S3: 诚实化 doctor 诊断
- **描述**: 在 `worktreeDoctor`/`checkSharedResource`/`checkDirectory` 中区分：`shared` 资源仅对 symlink 判 pass，tracked copy 降为 ⚠️ warn 并提示"主仓变更不实时同步"；`isolated tasks` 仅当 `tasks/current` 未被跟踪（独立）时判 pass，否则 warn。同步更新 `getWorktreeDiagnostics` 中 managed 判定。
- **验收条件**: 在本仓新建 worktree 后 `doctor` 对 `backlog` 显示 ✅ symlink、对 `rules` 显示 ⚠️ tracked-snapshot；`tasks` 显示 ✅ isolated。
- **依赖**: S2

### S4: 拆除死代码
- **描述**: 移除 `src/utils/worktree.ts` 中未被外部调用的 `resolveSharedResource`/`getMainRepoPath`/`isInWorktree`（确认无引用后），或若 S2 需要则改造为真实运行时重定向并接回 backlog 命令。优先移除以消除地雷。
- **验收条件**: `grep -rn resolveSharedResource\|getMainRepoPath\|isInWorktree src/` 无残留引用（或全部接回真实调用）；构建通过。
- **依赖**: S2

### S5: 更新文档
- **描述**: 更新 `CLAUDE.md` worktree 表格（共享/隔离机制按选项 C 重新表述：backlog=symlink 真共享，rules=tracked 合并中介，tasks/current=gitignore 隔离，tasks/done=tracked）；更新 `docs/features/worktree-workflow.md` 对应章节。
- **验收条件**: 文档与 S2/S3 实现一致；无过期 symlink 描述。
- **依赖**: S2, S3

### S6: 更新测试覆盖新契约
- **描述**: 更新 `tests/worktree.test.mjs`：合成仓库需 track `rules` 与 `tasks/done`（而非全不 track），以覆盖 tracked-copy 与 symlink 混合分支；新增断言：`backlog` 为 symlink、`tasks/current` 独立、`rules` tracked copy、doctor 对 tracked shared 资源 warn。同步检查 doctor 相关断言。
- **验收条件**: `node --test tests/worktree.test.mjs` 全绿；新断言覆盖 S2/S3 行为。
- **依赖**: S2, S3

### S7: check + review 收口
- **描述**: 运行 `docpath check`；运行全量 `pnpm test`；运行 `docpath review`（如 profile 要求）；在本仓实测 `worktree create`/`doctor`/`remove` 一轮验证契约。
- **验收条件**: `docpath check` 通过；测试全绿；实测 worktree 满足 7 条验收（见 spec 验收）。
- **依赖**: S4, S5, S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S3 → S4
S2 → S5
S3 → S5
S2 → S6
S3 → S6
S4 → S7
S5 → S7
S6 → S7
