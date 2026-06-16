# Git Worktree 并发开发 - 使用指南

> DocPath Worktree 支持真并发开发：多个 Agent 在独立的 Git worktrees 中同时开发不同 features。

## 核心概念

### 什么是 Git Worktree？

Git Worktree 允许你在同一个仓库中同时检出多个分支到不同的目录：

```
主目录 (main 分支)
├─ .worktrees/
│  ├─ feature-a/  ← feature-a 分支
│  └─ feature-b/  ← feature-b 分支
```

### DocPath Worktree 的特殊之处

DocPath 在每个 worktree 中创建**独立的 .docpath/ 状态**，同时**共享需求池和规则**：

```
主目录/.docpath/
├─ backlog/  ← 共享（所有 worktrees 共用）
├─ rules/    ← 共享
└─ workspace/ ← 主目录的独立状态

.worktrees/feature-a/.docpath/
├─ backlog -> ../../.docpath/backlog/  ← symlink 共享
├─ rules -> ../../.docpath/rules/      ← symlink 共享
├─ workspace/  ← feature-a 的独立状态
└─ tasks/      ← feature-a 的独立任务
```

---

## 快速开始

### 1. 创建 Worktree

```bash
# 在主仓库目录
docpath worktree create feature-a

# 输出：
# 🌳  创建 worktree: feature-a
# ✅  worktree 已创建: .worktrees/feature-a
# 从主仓库检查:
#   docpath worktree doctor feature-a
# 进入 worktree 后:
#   cd .worktrees/feature-a
#   export DOCPATH_SESSION=codex-feature-a
#   docpath worktree doctor
#   docpath next --agent
```

### 2. 进入 Worktree 开发

```bash
cd .worktrees/feature-a
export DOCPATH_SESSION=codex-feature-a
docpath worktree doctor

# 开始开发
docpath backlog promote R-xxx
docpath agent enter
docpath go --step S1
# ... 写代码 ...
docpath agent step --step S1 --status done
docpath check
docpath review
docpath journal
docpath changes --agent
```

### 3. 列出所有 Worktrees

```bash
docpath worktree list

# 输出：
# 🌳  Worktrees:
#   • /path/to/project (main)
#   • /path/to/project/.worktrees/feature-a (feature-a)
```

### 4. 删除 Worktree

```bash
# 回到主目录
cd /path/to/project

# 删除 worktree
docpath worktree remove feature-a

# 如果有未提交变更，使用 --force
docpath worktree remove feature-a --force
```

---

## 并发开发场景

### 场景 1：Codex + Claude Code 并发开发

**Terminal 1 (Codex 开发 Feature A)**：
```bash
cd /project
docpath worktree create feature-a
cd .worktrees/feature-a

export DOCPATH_SESSION=codex
docpath backlog promote R-100
docpath agent enter
# ... 开发 Feature A ...
```

**Terminal 2 (Claude Code 开发 Feature B)**：
```bash
cd /project
docpath worktree create feature-b
cd .worktrees/feature-b

export DOCPATH_SESSION=claude
docpath backlog promote R-101
docpath agent enter
# ... 开发 Feature B ...
```

✅ **两个 worktrees 完全独立，互不干扰！**

### 场景 2：协作开发同一个 Feature

同一个 feature 需要多 Agent 协作时，按子范围拆成多个 worktrees。不要在同一个 worktree 中混用多个 Agent/session；这会让 lease、breadcrumb 和 closeout 证据变得不清晰。

```bash
# Codex 负责后端
docpath worktree create feature-auth-backend
cd .worktrees/feature-auth-backend
export DOCPATH_SESSION=codex-feature-auth-backend
docpath worktree doctor

# Claude Code 负责前端（另一个 worktree）
docpath worktree create feature-auth-frontend
cd .worktrees/feature-auth-frontend
export DOCPATH_SESSION=claude-feature-auth-frontend
docpath worktree doctor
```

---

## 命令参考

### `docpath worktree create <name>`

创建新 worktree。

**参数**：
- `<name>`: Worktree 名称（也是分支名）

**示例**：
```bash
docpath worktree create feature-auth
docpath worktree create bugfix-123
```

**自动完成**：
- 创建 Git 分支
- 创建 `.worktrees/<name>` 目录
- 初始化独立 `.docpath/` 结构
- 创建共享资源 symlinks

### `docpath worktree list`

列出所有 worktrees。

**输出**：
```
🌳  Worktrees:
  • /Users/mac/project/docpath
    branch: refs/heads/main
  • /Users/mac/project/docpath/.worktrees/feature-a
    branch: refs/heads/feature-a
```

### `docpath worktree doctor [name]`

只读检查 worktree 是否适合开始或收尾开发。

**检查内容**：
- Git worktree metadata
- `.docpath/` 目录结构
- `backlog` / `rules` symlink
- isolated `workspace` / `tasks` / `journal`
- runtime state/current/breadcrumb 文件
- `node_modules` 是否已安装（仅 warning，不自动安装）
- `DOCPATH_SESSION` 是否已设置

**示例**：
```bash
# 从主仓库检查指定 worktree
docpath worktree doctor feature-auth

# 在 worktree 内检查当前 worktree
cd .worktrees/feature-auth
docpath worktree doctor
```

### `docpath worktree remove <name> [--force]`

删除 worktree。

**参数**：
- `<name>`: Worktree 名称
- `--force`: 强制删除（忽略未提交变更）

**示例**：
```bash
docpath worktree remove feature-a
docpath worktree remove feature-a --force
```

**安全检查**：
- 默认拒绝删除有未提交变更的 worktree
- 使用 `--force` 可以跳过检查

---

## 共享与隔离策略

### 共享资源（Symlink）

以下资源在所有 worktrees 间共享：

| 资源 | 说明 |
|------|------|
| `backlog/` | 需求池（全局共享） |
| `rules/` | 规则和最佳实践 |
| `spec/` | 架构规范 |
| `templates/` | 模板文件 |

**实现**：通过 symlink 指向主仓库。

**好处**：
- 所有 worktrees 看到相同的需求池
- 规则更新自动同步
- 避免重复维护

### 隔离资源（独立）

以下资源在每个 worktree 中独立：

| 资源 | 说明 |
|------|------|
| `workspace/` | 运行时状态（state.json, breadcrumb 等） |
| `tasks/` | 任务文件和计划 |
| `journal/` | 知识归档 |
| `docs-index.json` | 文档索引 |

**好处**：
- 完全物理隔离
- 零冲突风险
- 各自状态独立

---

## 标准落地流程

Worktree 开发完成后，默认流程是：**先在 worktree 分支形成干净提交，再从受控 main 合并**。不要把 dirty main、worktree runtime 噪声、源码变更混在一个提交里。

### 1. Worktree 内完成验证与收口

```bash
cd .worktrees/feature-a
export DOCPATH_SESSION=codex-feature-a

docpath worktree doctor
docpath check
docpath review
docpath journal
docpath changes --agent
```

`docpath changes --agent` 会在 worktree 中输出 `worktree_isolation`：

- `expected_noise_files`: 由 `.docpath/` 隔离机制导致的预期噪声，不作为普通源码提交范围。
- `commit_relevant_files`: 应优先审查和 staged 的源码、测试、文档文件。
- `ignored_evidence.add_command`: 如需提交 canonical DocPath evidence，只执行该字段给出的精确 `git add -f`。

### 2. 在 worktree 分支提交

```bash
# 只 stage commit_relevant_files 中的实现文件
git add <commit_relevant_files...>

# 如团队要求提交 DocPath evidence，再执行 changes --agent 给出的精确 add_command
# git add -f .docpath/tasks/done/<task>/spec.md ...

git commit -m "feat: implement feature A"
```

不要 stage `worktree_isolation.expected_noise_files`。这些通常是 worktree 将 tracked `.docpath/` 内容替换为 isolated runtime 或 shared symlink 后产生的状态噪声。

### 3. 准备 main 再合并

```bash
cd /project
git status --short
```

如果 main 有无关 dirty 变更，先单独处理：

```bash
git stash push -m "pre-merge local main changes"
```

然后合并：

```bash
git checkout main
git merge feature-a
```

合并后如需继续使用全局 `docpath`，从 main 重新 link：

```bash
npm link
```

如之前 stash 了 main 的本地变更，确认合并正常后再恢复：

```bash
git stash pop
```

### 4. 清理 worktree

```bash
docpath worktree remove feature-a
git branch -d feature-a
```

### 禁止的合并方式

```bash
# 不要在 dirty main 上直接 merge worktree
git merge feature-a

# 不要用 git add . 吞入 worktree .docpath 隔离噪声
git add .

# 不要把 tasks/current alias evidence 当作默认提交证据
git add -f .docpath/tasks/current/*
```

### 处理 .docpath/ 合并冲突

**自动合并**：
- `backlog/`: Symlink，无冲突
- `rules/`: Symlink，无冲突

**手动处理**：
- `workspace/`: 使用主目录版本（`git checkout --ours .docpath/workspace/`）
- `tasks/`: 移动 worktree 的任务到 `tasks/done/`

---

## 最佳实践

### 1. 使用 Session ID 区分 Agent

```bash
export DOCPATH_SESSION=codex
export DOCPATH_SESSION=claude
```

这样可以在 breadcrumb 中看到是谁做的操作。

### 2. Worktree 命名约定

推荐格式：
- `feature-<name>`: 新功能
- `bugfix-<issue>`: Bug 修复
- `refactor-<name>`: 重构

### 3. 定期合并主分支

```bash
cd .worktrees/feature-a
git fetch origin
git merge origin/main
```

避免分支偏离太远。

### 4. 完成后及时清理

```bash
# 合并后删除 worktree 和分支
docpath worktree remove feature-a
git branch -d feature-a
```

---

## 故障排查

### Q: 创建 worktree 失败：分支已存在

**问题**：
```
fatal: a branch named 'feature-a' already exists
```

**解决**：
```bash
# 删除旧分支
git branch -D feature-a

# 或使用不同名称
docpath worktree create feature-a-v2
```

### Q: Symlink 不工作（Windows）

**问题**：Windows 默认不支持 symlink。

**解决**：
1. 启用开发者模式
2. 或使用 WSL2
3. 或使用 Git Bash with admin权限

### Q: Worktree 删除失败：有未提交变更

**问题**：
```
❌  删除 worktree 失败
提示: 使用 --force 强制删除
```

**解决**：
```bash
# 选项 1: 提交变更
cd .worktrees/feature-a
git commit -am "wip"

# 选项 2: 强制删除
cd /project
docpath worktree remove feature-a --force
```

### Q: 两个 worktrees 看到不同的 backlog

**问题**：Symlink 没有正确创建。

**检查**：
```bash
cd .worktrees/feature-a
readlink .docpath/backlog
# 应该输出: ../../.docpath/backlog
```

**修复**：删除并重新创建 worktree。

---

## 限制与注意事项

### 当前限制

1. **单活跃任务**：仍是单活跃任务模型（一个 worktree 一个任务）
2. **手动合并**：需要手动处理 Git 合并
3. **Windows Symlink**：需要开发者模式

### 不支持的场景

- ❌ 自动多 Agent 编排
- ❌ 跨 worktree 状态同步
- ❌ Worktree 间任务依赖

### 推荐的使用边界

- ✅ 并发开发不同 features
- ✅ 临时实验分支
- ✅ 快速切换上下文
- ❌ 不建议超过 5 个活跃 worktrees（维护成本）

---

## 架构细节

### 目录结构

```
project/
├─ .docpath/
│  ├─ backlog/              ← 真实文件（共享）
│  ├─ rules/                ← 真实文件（共享）
│  ├─ workspace/            ← 主目录独立状态
│  └─ tasks/                ← 主目录任务
├─ .worktrees/
│  └─ feature-a/
│     ├─ .docpath/
│     │  ├─ backlog -> ../../.docpath/backlog/  ← symlink
│     │  ├─ rules -> ../../.docpath/rules/      ← symlink
│     │  ├─ workspace/      ← feature-a 独立状态
│     │  └─ tasks/          ← feature-a 任务
│     └─ src/               ← feature-a 代码
└─ .git/
   └─ worktrees/
      └─ feature-a/         ← Git 管理的 worktree 元数据
```

### 并发安全

- **Backlog 写入**：使用 `withLock` 互斥锁
- **Workspace 隔离**：物理隔离，零冲突
- **Git 分支**：Git 原生隔离

---

## 进一步阅读

- [Git Worktree 官方文档](https://git-scm.com/docs/git-worktree)
- [DocPath Session 隔离](./session-isolation-mvp.md)
- [DocPath 架构设计](./architecture.md)

---

**需要帮助？** 在 GitHub Issues 提问或查看 [FAQ](./faq.md)。
