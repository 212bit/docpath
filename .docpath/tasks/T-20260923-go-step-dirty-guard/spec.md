# T-20260923-go-step-dirty-guard - go --step 对未跟踪文件的 dirty guard 报错信息补充

> backlog_id: R-360

## 1. 背景与动机

`docpath go --step` 因未跟踪文件未归属而拒绝时，早期报错只笼统说 dirty。当前 git-dirty-guard.ts 已区分「未跟踪新文件」与「已跟踪修改」并给出 git add / --accept-dirty 指引，但仍未明确提示 shell 层特殊字符（反引号、`$`、`!`）之外的常见坑——未跟踪文件本质是「未被 git 认领」，必须先 git add 归属。本任务在现有报错基础上补强措辞。

## 2. 需求清单

### 功能需求
- [x] FR-1: 未跟踪文件报错段补强——明确「未跟踪=未归属，git add 认领后才能被门禁视为本任务文件」
- [x] FR-2: 补充「不要 git add -A」提醒（worktree 常有别的 agent 在改，半成品会被扫进 commit）

### 非功能需求
- [x] NFR-1: 不改既有 git add / --accept-dirty 指引结构

## 3. 范围界定

### 包含
- git-dirty-guard.ts buildDirtyWorktreeError 的未跟踪段措辞补强

### 不包含
- 改变 dirty guard 的拦截逻辑

## 4. 关键决策

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 是否扩大拦截逻辑 | 否 | 诉求是信息清晰度，非行为变更 |

## 5. 验收标准

- [x] AC-1: 报错未跟踪段含「未跟踪=未归属」与「不要 git add -A」提示
- [x] AC-2: 已跟踪修改段指引不变
