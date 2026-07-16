## 执行计划

### S1: create 强制 backlog symlink
- [x] S1: create 强制 backlog symlink
- **描述**: initWorktreeDocpath 对 backlog 始终 symlink 到 main；copyTargetBacklogContext 在 symlink 时跳过拷贝。
- **验收条件**: AC-1/AC-3
- **依赖**: 无

### S2: doctor FAIL + repair
- [x] S2: doctor FAIL + repair
- **描述**: doctor 用 checkLiveShared 检查 backlog；repair 将 backlog 副本改为 symlink。
- **验收条件**: AC-2
- **依赖**: S1

### S3: 测试与收口
- [x] S3: 测试与收口
- **描述**: 更新 worktree 测试；check/review/journal/commit。
- **验收条件**: AC-4；质量门禁通过
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
