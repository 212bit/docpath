# 任务热暂存与上下文恢复 (Task Stash & Switch)

## 概述

在单工作区（Single Workspace）日常敏捷开发中，经常遇到临时打断场景：
- 正在进行某个大功能开发，突然遇到线上紧急 Bug / 阻断性 Issue 需要即刻修复；
- 多个需求在同一工作区串行推进，需要在不丢失当前进度、不污染未提交代码的前提下快速切换。

DocPath 提供了原生的 **Task Stash & Switch** 机制：一键暂存活跃任务的全部运行时状态（State）、规范与计划真源（Spec/Plan/Breadcrumb）以及 Git 工作区未提交改动，并在打断任务处理完成后无缝恢复。

---

## 核心命令

### 1. 暂存当前任务 (`docpath task stash`)
```bash
# 暂存当前活跃任务（自动保存 state + task files + git uncommitted changes，并将工作区重置为 idle）
docpath task stash "临时打断：紧急修复登录鉴权"

# 仅暂存 DocPath 任务上下文，不暂存 Git 代码变动
docpath task stash "暂存说明" --no-git

# 机器输出模式
docpath task stash --agent
```

### 2. 查看暂存列表 (`docpath task stash list`)
```bash
docpath task stash list
# 或
docpath task list

# 输出结构化 JSON
docpath task stash list --json
```

### 3. 恢复暂存任务 (`docpath task pop` / `docpath task stash pop`)
```bash
# 恢复最近一条暂存记录（自动恢复 state + task 目录 + git changes）
docpath task pop

# 按 ID 或序号指定恢复
docpath task pop stash-1790346281870-T-FEATURE
docpath task pop 1

# 机器输出模式
docpath task pop --agent
```

### 4. 任务平滑切换 (`docpath task switch <target>`)
```bash
# 自动暂存当前正在进行的任务，并切换/恢复目标任务
docpath task switch T-20260925-feature-auth

# 切换至已有的 Backlog 需求（自动暂存当前任务并拉起目标需求）
docpath task switch R-102
```

### 5. 清理/丢弃暂存记录 (`docpath task drop`)
```bash
# 丢弃指定的暂存记录
docpath task drop stash-1790346281870-T-FEATURE

# 清理所有暂存记录
docpath task drop --all
```

---

## 隔离与存储模型

暂存数据保存在 `.docpath/workspace/stashes/<stash_id>/`（属于 Git 忽略的 workspace 运行时隔离域）：
- `meta.json`: 记录 Task ID、标题、创建时间、备注说明、Git Stash 引用等；
- `state.json`: 保存当时的 workspace state 全量快照；
- `task/`: 保存 canonical task 目录中的所有产物（spec.md, spec.json, plan.md, plan.json 等）。

当暂存包含未提交的 Git 改动时，DocPath 会创建带有专属前缀（`docpath-stash:<taskId>:<timestamp>`）的 Git Stash，并在 `task pop` 时自动精确恢复。
