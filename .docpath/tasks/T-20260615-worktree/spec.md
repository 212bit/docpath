## Journal Record

# Worktree 真并发开发 - 知识归档

## 任务概述

实现 Git Worktree + 独立 .docpath/ 架构，支持真并发开发。

**成果**：
- ✅ `docpath worktree create/list/remove` 命令
- ✅ Symlink 策略（共享 backlog/rules，隔离 workspace/tasks）
- ✅ 并发安全验证通过
- ✅ 完整使用文档

**工作量**：8 小时（符合预期）

---

## 关键技术决策

### 1. Git 复制问题与清理策略

**问题**：`git worktree add` 会把 `.docpath/` 整个目录复制过来（因为在 git 中被跟踪）

**解决**：在 `initWorktreeDocpath()` 中主动清理复制的内容：
- 删除 `workspace/`, `tasks/`, `journal/`（需要隔离）
- 删除 `backlog/`, `rules/`（需要 symlink）
- 重建正确的目录结构

**Why**：Git worktree 的标准行为，需要额外处理以实现我们的隔离策略。

---

### 2. Symlink 策略

**共享资源**（Symlink）：
- `backlog/` - 需求池全局共享
- `rules/` - 规则全局一致
- `spec/` - 架构规范全局
- `templates/` - 模板全局一致

**隔离资源**（独立目录）：
- `workspace/` - 运行时状态独立
- `tasks/` - 任务独立
- `journal/` - 归档独立

**Why**：平衡共享与隔离，backlog 需要全局视图，workspace 需要各自状态。

---

### 3. 环境检测机制

**实现**：
```typescript
function isInWorktree(cwd) {
  // .git 是文件（gitdir 指针）→ worktree
  // .git 是目录 → 主仓库
}
```

**用途**：未来命令可以感知 worktree 环境，调整行为（如 backlog 路径解析）。

---

## 经验教训

### 做对的

1. **先测试再提交**
   - 发现 Git 复制问题
   - 及时调整 `initWorktreeDocpath()` 逻辑

2. **清晰的目录结构**
   - 隔离/共享策略明确
   - Symlink 相对路径正确

3. **并发验证**
   - 手动测试两个 worktree 同时运行
   - 验证状态隔离和共享正确性

### 可改进的

1. **自动化测试**
   - 测试用例编写但未运行成功
   - 下次应先验证测试环境

2. **Windows 兼容性**
   - Symlink 在 Windows 需要特殊权限
   - 文档已说明，但可考虑 fallback

---

## 可复用模式

### Pattern: Git Worktree 清理

```typescript
async function initWorktreeDocpath(mainRepo, worktreePath) {
  // 1. 清理 git 复制的内容
  for (const item of ['workspace', 'tasks', 'journal']) {
    await rm(join(worktreePath, '.docpath', item), { recursive: true });
  }
  
  // 2. 重建独立目录
  await mkdir(join(worktreePath, '.docpath', 'workspace'), { recursive: true });
  
  // 3. 创建共享 symlink
  await symlink('../../.docpath/backlog', join(worktreePath, '.docpath', 'backlog'));
}
```

**适用场景**：任何需要在 Git worktree 中自定义目录结构的场景。

---

### Pattern: 命令注册

```typescript
// src/commands/register/worktree.ts
export function registerWorktreeCommands(cli: CAC): void {
  cli.command('worktree [action] [name]', '...')
     .option('--force', '...')
     .action(async (action, name, options) => {
       await worktreeCommand({ cwd, action, name, force });
     });
}

// src/commands/register.ts
import { registerWorktreeCommands } from './register/worktree.js';
registerWorktreeCommands(cli);
```

**适用场景**：新增 DocPath 命令的标准流程。

---

## 遗留问题

### 需要后续完善

1. **命令 worktree 感知**（Week 2）
   - `backlog`/`docs` 等命令需要使用 `resolveSharedResource()`
   - 确保在 worktree 中访问共享资源正确

2. **合并辅助工具**（Week 3，可选）
   - `docpath worktree pre-merge` - 检查冲突
   - `docpath worktree post-merge` - 清理状态

3. **自动化测试**
   - 修复 `tests/worktree.test.mjs` 的环境问题
   - 补充并发测试用例

---

## 文档位置

- 使用指南：`docs/features/worktree-workflow.md`
- 技术分析：`.docpath/workspace/worktree-analysis.md`
- 决策记录：`.docpath/workspace/worktree-decision.md`

---

## 下一步建议

**Week 2（命令适配）**：
- 实现 R-192: 让所有命令感知 worktree
- 测试完整开发流程

**验收标准**：
- Worktree A 和 B 可以完整走完 brainstorm → check → commit
- 共享资源正确同步
- 隔离资源互不干扰

---

**总结**：Week 1 基础设施已完成，核心功能工作正常，为 Week 2 奠定基础。
