# T-20260716-worktree-backlog-per-worktree-live-share - worktree backlog live-shared symlink

> backlog_id: R-271

## 1. 背景与动机

worktree 中 backlog 被复制为 tracked copy，main 上状态更新对 worktree 不可见；id 分配仅扫本地目录。分析见 `.docpath/backlog/analysis/R-271-analysis.md`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: worktree create 始终将 `.docpath/backlog` 配置为指向主仓的 live-shared symlink（即使 main 中 backlog 被 git 跟踪）
- [ ] FR-2: worktree doctor 将 backlog 非 symlink 的目录副本判定为 FAIL
- [ ] FR-3: worktree repair 可将 backlog 目录副本修正为 symlink
- [ ] FR-4: `--backlog` 目标上下文在 live-shared 下无需拷贝

### 非功能需求
- [ ] NFR-1: 不改变 rules/templates 的 merge-mediated 策略（本次仅 backlog）
- [ ] NFR-2: id 分配继续依赖共享目录 + wx 独占创建

## 3. 范围界定

### 包含
- worktree create/doctor/repair 对 backlog 的 live-share 行为
- 相关测试

### 不包含
- 将 main 仓库 backlog 从 git 取消跟踪的迁移
- rules/spec/templates 策略变更

## 4. 关键决策

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 跟踪目录是否仍 symlink | 是 | live 一致性优先于 worktree 内 backlog 路径的 git 噪声 |
| 2 | doctor 级别 | FAIL | 与 R-271 期望一致，避免 silent stale |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: worktree backlog 副本 stale + id 撞号
- 目标: backlog live-shared symlink + doctor FAIL
- 推荐方案: 强制 symlink（含 tracked 场景）
- 不做什么: 不 untrack main backlog；不改 rules 策略
- 用户确认: 目标「完成剩余所有 backlog」下推进

## 5. 验收标准

- [ ] AC-1: worktree create 将 backlog 建为指向主仓的 symlink
- [ ] AC-2: doctor 在 backlog 为普通目录副本时 FAIL
- [ ] AC-3: --backlog 在 live-shared 下无需拷贝即可可见
- [ ] AC-4: 自动化测试覆盖 create symlink 与 doctor fail
