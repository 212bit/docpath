## 执行计划

### S1: 建立 worktree 修复边界与测试夹具
- **描述**: 梳理现有 worktree 实现，建立临时 Git 仓库测试夹具，覆盖 create/list/remove 的基础路径。
- **验收条件**: 测试能在临时 Git repo 中调用本地 CLI；能断言 worktree 创建位置、shared symlink、runtime 文件和 remove 行为。
- **依赖**: 无

### S2: 修复命令执行与名称/路径安全
- **描述**: 将 Git 调用改为 argv 执行；新增 worktree 名称校验；所有路径锚定 Git top-level，并确保 worktree 路径限制在 `.worktrees/` 下。
- **验收条件**: 非法名称 fail-loud；命令不再 shell 拼接用户输入；从子目录运行仍使用 repo root。
- **依赖**: S1

### S3: 修复 DocPath runtime 初始化与 shared symlink
- **描述**: 修复 symlink 相对路径；创建 worktree 后写入最小可用 `.docpath/workspace` runtime；修复 ESM worktree 检测。
- **验收条件**: shared resources 解析到主仓库；新 worktree 可运行 `docpath next --agent`；`isInWorktree()` 识别 `.git` 文件。
- **依赖**: S2

### S4: 补齐 remove/list 行为与清理 demo 文件
- **描述**: 确认 `worktree list` 输出可用状态；`worktree remove` 支持 clean 删除、dirty 默认拒绝和 `--force` 删除；删除 `hello.txt`、`world.txt`。
- **验收条件**: remove/list 测试通过；demo 文件不再存在。
- **依赖**: S3

### S5: 验证、审查与归档
- **描述**: 运行定向测试、typecheck、必要全量测试和 DocPath check/review/journal/changes，修复发现的问题并归档任务。
- **验收条件**: 验证通过；R-184/T-20260615-worktree-2 evidence 完整；提交范围清晰。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
