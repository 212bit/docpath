# Worktree 真并发开发支持 — 执行计划

## 执行计划

### S1: Worktree 命令基础架构
- **描述**: 实现 worktree 命令注册和基础函数（create/list/remove）
- **文件**: 
  - 新增 `src/commands/worktree.ts`
  - 新增 `src/utils/worktree.ts`
  - 修改 `src/commands/register/worktree-commands.ts`
- **验收条件**: 
  - `docpath worktree --help` 显示帮助
  - 命令注册完成，可调用但未实现逻辑
  - 构建通过，无 TypeScript 错误
- **依赖**: 无

### S2: Worktree create 实现
- **描述**: 实现 `docpath worktree create <name>` 命令
- **逻辑**:
  - 调用 `git worktree add .worktrees/<name> -b <name>`
  - 在 worktree 中初始化 `.docpath/`
  - 创建 symlink: backlog/rules/spec/templates → 主目录
  - 设置 DOCPATH_WORKTREE 环境变量标记
- **验收条件**:
  - `docpath worktree create test-a` 成功创建
  - `.worktrees/test-a/.docpath/` 目录存在
  - Symlink 正确指向主目录
  - Git 分支正确创建
- **依赖**: S1

### S3: Worktree list/remove 实现
- **描述**: 实现 list 和 remove 命令
- **list 逻辑**:
  - 调用 `git worktree list --porcelain`
  - 解析输出，格式化显示
- **remove 逻辑**:
  - 检查 worktree 状态（是否有未提交变更）
  - 调用 `git worktree remove <path>`
  - 清理残留文件
- **验收条件**:
  - `docpath worktree list` 显示所有 worktrees
  - `docpath worktree remove test-a` 成功删除
  - 有未提交变更时拒绝删除（或 --force）
- **依赖**: S1

### S4: Worktree 环境检测
- **描述**: 实现 worktree 环境检测函数
- **文件**: `src/utils/worktree.ts`
- **函数**:
  - `isInWorktree(cwd)`: 检测是否在 worktree
  - `getMainRepoPath(cwd)`: 获取主仓库路径
  - `resolveSharedResource(cwd, resource)`: 解析共享资源路径
- **验收条件**:
  - 在主目录调用返回 false
  - 在 worktree 调用返回 true
  - 正确解析主仓库路径
- **依赖**: S2

### S5: Symlink 策略实现
- **描述**: 确定并实现隔离/共享策略
- **策略**:
  - 共享（symlink）: backlog/, rules/, spec/, templates/
  - 隔离（独立）: workspace/, tasks/, journal/, docs-index.json
- **实现**: 在 `docpath worktree create` 中创建 symlinks
- **验收条件**:
  - 创建 worktree 后 symlinks 正确
  - 共享目录修改在主目录可见
  - 隔离目录修改互不影响
- **依赖**: S2

### S6: 测试覆盖 — 基础设施
- **描述**: 为 worktree 命令编写测试
- **文件**: `tests/worktree.test.mjs`
- **覆盖**:
  - create/list/remove 命令
  - Symlink 创建和验证
  - 环境检测函数
  - 错误处理（重复创建、删除不存在等）
- **验收条件**:
  - 所有测试通过
  - 覆盖率 > 80%
- **依赖**: S3, S4, S5

### S7: 并发安全验证
- **描述**: 验证两个 worktree 同时运行基本命令
- **测试场景**:
  - 同时运行 `docpath next --agent`
  - 同时读写 backlog
  - 同时运行 `docpath status --agent`
- **验收条件**:
  - 无冲突错误
  - 共享资源正确同步
  - 隔离资源互不干扰
- **依赖**: S6

### S8: 文档和使用示例
- **描述**: 编写 worktree 使用文档
- **文件**: 
  - `docs/features/worktree-workflow.md`
  - 更新 `CLAUDE.md`
- **内容**:
  - Worktree 概念说明
  - 创建/管理命令
  - 使用场景和示例
  - 最佳实践
  - 故障排查
- **验收条件**:
  - 文档完整清晰
  - 包含完整示例
- **依赖**: S7

## Checklist
- [x] S1: Worktree 命令基础架构
- [x] S2: Worktree create 实现
- [x] S3: Worktree list/remove 实现
- [x] S4: Worktree 环境检测
- [x] S5: Symlink 策略实现
- [x] S6: 测试覆盖 — 基础设施
- [x] S7: 并发安全验证
- [x] S8: 文档和使用示例

## 依赖关系图
```
S1 → S2 → S5
  ↓    ↓
  S3   S4
   ↓  ↓
    S6
     ↓
    S7
     ↓
    S8
```

## 时间估算

| 步骤 | 预计时间 | 说明 |
|------|---------|------|
| S1 | 30 min | 命令注册和骨架 |
| S2 | 2 hours | Create 核心逻辑 |
| S3 | 1 hour | List/Remove 实现 |
| S4 | 45 min | 环境检测函数 |
| S5 | 30 min | Symlink 策略（在 S2 中实现） |
| S6 | 2 hours | 测试编写 |
| S7 | 1 hour | 并发测试 |
| S8 | 1 hour | 文档编写 |
| **总计** | **8-9 hours** | **Week 1 基础设施** |

## 风险和缓解

| 风险 | 缓解措施 |
|------|---------|
| Symlink 在 Windows 失效 | 文档说明需要开发者模式，或提供 fallback 方案 |
| Git worktree 命令失败 | 详细错误处理和用户提示 |
| 并发测试不稳定 | 使用 withLock 确保原子性，多次运行测试 |

## 验收标准（Week 1 总体）

```bash
# 创建两个 worktree
docpath worktree create feature-a
docpath worktree create feature-b

# Worktree A 运行基本命令
cd .worktrees/feature-a
docpath next --agent          # ✅ 成功
docpath backlog list          # ✅ 看到共享的 backlog

# Worktree B 同时运行（无冲突）
cd .worktrees/feature-b
docpath next --agent          # ✅ 成功，无冲突
docpath backlog list          # ✅ 看到共享的 backlog

# 清理
cd /project/docpath
docpath worktree remove feature-a
docpath worktree remove feature-b
```
