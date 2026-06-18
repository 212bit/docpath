# T-20260528-link 实现计划

## 方案: Config 引用

### 核心设计

**链接机制**: 在 `.docpath/config.yaml` 中存储 `linked_to` 字段，指向目标项目的 `.docpath/` 目录。

**透明重定向**: 所有 DocPath 命令通过 `resolveDocpathDir()` 工具函数获取实际的 `.docpath/` 路径。

---

## 实现步骤

### Step 1: 新增工具函数 `resolveDocpathDir`

**文件**: `src/utils/config.ts`

```typescript
/**
 * 解析实际的 .docpath/ 目录路径
 * 如果 config.yaml 中有 linked_to 字段，返回链接目标路径
 * 否则返回本地 .docpath/ 路径
 */
export async function resolveDocpathDir(cwd: string): Promise<string> {
  const localDocpath = join(cwd, '.docpath');
  const configPath = join(localDocpath, 'config.yaml');
  
  if (await exists(configPath)) {
    const content = await readFile(configPath, 'utf-8');
    const match = content.match(/linked_to:\s*(.+)/);
    if (match) {
      const linkedPath = match[1].trim().replace(/['"]/g, '');
      return resolve(cwd, linkedPath);
    }
  }
  
  return localDocpath;
}
```

### Step 2: 修改 `initCommand` 支持 `--link`

**文件**: `src/commands/init.ts`

```typescript
interface InitOptions {
  cwd?: string;
  level?: ComplexityLevel;
  force?: boolean;
  link?: string;  // 新增：链接目标路径
}
```

**--link 流程**:
1. 解析目标路径为绝对路径
2. 检查目标 `.docpath/` 是否存在
3. 创建本地 `.docpath/` 目录（仅含 config.yaml）
4. 写入 config.yaml 含 `linked_to` 字段
5. 不创建 workspace/spec/tasks 等子目录（它们在目标中）

### Step 3: 新增 `unlink` 命令

**文件**: `src/commands/unlink.ts`（新建）

```typescript
export async function unlinkCommand(options: { cwd?: string }): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const configPath = join(cwd, '.docpath/config.yaml');
  
  // 读取并移除 linked_to 字段
  // 如果需要，创建独立的 .docpath/ 结构
}
```

### Step 4: 修改所有命令使用 `resolveDocpathDir`

**需要修改的文件**:
- `src/commands/status.ts`
- `src/commands/check.ts`
- `src/commands/reveal.ts`
- `src/commands/plan.ts`
- `src/commands/go.ts`
- `src/commands/journal.ts`
- `src/commands/docs.ts`
- `src/commands/config.ts`

**模式**:
```typescript
// Before
const docpathDir = join(cwd, '.docpath');

// After
const docpathDir = await resolveDocpathDir(cwd);
```

### Step 5: 更新 CLI 注册

**文件**: `src/cli.ts`

```typescript
program
  .command('init')
  .option('--link <path>', '关联另一个项目的 .docpath/')
  // ...

program
  .command('unlink')
  .description('解除 .docpath/ 关联')
  // ...
```

### Step 6: status 显示链接状态

当检测到 `linked_to` 时，显示：
```
📊  DocPath 工作流状态

  🔗  链接状态: 已关联 → /path/to/other/.docpath/
  级别:  Level 1
  状态:  idle
  ...
```

---

## 验收标准

- [ ] `docpath init --link ../other-project` 创建链接
- [ ] `docpath status` 显示链接状态
- [ ] `docpath unlink` 解除链接
- [ ] 链接后，所有 DocPath 命令正常工作（读取目标 .docpath/）
- [ ] 跨平台兼容（Windows/Mac/Linux）

---

## 风险与注意事项

1. **循环链接**: 需检测 A→B→A 的循环引用
2. **目标不存在**: 链接目标被删除后，命令应报错提示
3. **相对路径 vs 绝对路径**: config.yaml 中存储相对路径更可移植
