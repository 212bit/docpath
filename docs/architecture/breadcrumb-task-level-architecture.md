---
related:
  - design/state-machine-correctness-analysis.md
  - workflows/artifact-policy.md
---

# Breadcrumb 任务级优先架构

## 概述

从双写模式（全局 + 任务级）迁移到任务级优先架构，简化 breadcrumb 管理逻辑。

## 架构决策

**ADR-001: 任务级 breadcrumb 作为单一真源**

### 背景

原架构同时维护：
- 全局 breadcrumb.jsonl (`.docpath/workspace/breadcrumb.jsonl`)
- 任务级 breadcrumb.jsonl (`.docpath/tasks/{taskId}/breadcrumb.jsonl`)

问题：
1. 双写逻辑复杂，存在同步风险
2. 全局文件轮转（MAX_ENTRIES=200）会丢失老任务历史
3. 归档时无法保证完整历史

### 决策

**方案 A（已实施）**：任务级优先 + 按需聚合

- **写入**：只写任务级文件 `.docpath/tasks/{taskId}/breadcrumb.jsonl`
- **读取**：
  - 有 activeTaskId：读取该任务的 breadcrumb.jsonl
  - idle 状态：聚合所有活跃任务的 breadcrumb
  - 降级：读取遗留的全局文件（迁移期兼容）
- **归档**：任务目录自包含完整历史

### 优点

1. ✅ 单一真源，无同步问题
2. ✅ 归档时自包含完整历史
3. ✅ 支持 worktree 隔离
4. ✅ 无全局文件大小限制
5. ✅ 代码更简洁

### 权衡

- 跨任务聚合查询需遍历 20 个任务目录（约 200 条记录，性能可接受）

## 实现细节

### 核心函数

**writeBreadcrumb**
```typescript
// 只写任务级文件
await appendTaskBreadcrumbJsonl(projectRoot, entry);
```

**readBreadcrumb**
```typescript
// 1. 有活跃任务 → 读任务级
const activeTaskId = await readActiveTaskId(projectRoot);
if (activeTaskId) {
  return await readTaskBreadcrumbJsonl(projectRoot, activeTaskId);
}

// 2. idle → 聚合所有活跃任务
const aggregated = await aggregateAllTaskBreadcrumbs(projectRoot);
if (aggregated.entries.length > 0) return aggregated;

// 3. 降级 → 读遗留全局文件
return await readBreadcrumbJsonl(projectRoot);
```

**aggregateAllTaskBreadcrumbs**
```typescript
// 遍历 .docpath/tasks/* 目录，读取并聚合所有 breadcrumb.jsonl
const taskDirs = await readdir(join(projectRoot, '.docpath', 'tasks'));
const allEntries = [];
for (const taskId of taskDirs) {
  const entries = await readTaskBreadcrumbJsonl(projectRoot, taskId);
  if (entries) allEntries.push(...entries);
}
return summarizeBreadcrumb(allEntries.sort((a, b) => 
  (a.timestamp || '').localeCompare(b.timestamp || '')
));
```

### 迁移命令

```bash
docpath migrate-breadcrumb
```

将现有全局 breadcrumb.jsonl 拆分到各任务目录：
- 按 taskId 分组
- 写入 `.docpath/tasks/{taskId}/breadcrumb.jsonl`
- 跳过已有任务级文件的任务
- 保留全局文件作为备份

## 迁移指南

### 1. 运行迁移

```bash
# 构建最新代码
npm run build

# 执行迁移
node dist/index.js migrate-breadcrumb
```

输出示例：
```
🔄 开始迁移全局 breadcrumb 到任务级...
📊 全局文件共 200 条记录
📦 涉及 18 个任务
✅ T-20260619-xxx: 写入 6 条
⏭️  T-20260620-xxx: 已存在任务级文件，跳过 (10 条)
...
✅ 迁移完成:
   - 已迁移: 9 个任务
   - 已跳过: 9 个任务（已有任务级文件）
```

### 2. 验证迁移

```bash
# 检查任务级文件是否创建
ls -lh .docpath/tasks/*/breadcrumb.jsonl

# 测试读取聚合
node dist/index.js status
```

### 3. 清理（可选）

```bash
# 迁移成功后，可删除全局备份文件
rm .docpath/workspace/breadcrumb.jsonl
rm .docpath/workspace/breadcrumb.md
```

## 文件结构

```
.docpath/
├── workspace/
│   ├── breadcrumb.jsonl     # 已弃用（迁移期保留作备份）
│   └── breadcrumb.md        # 已弃用（迁移期保留作备份）
└── tasks/
    ├── T-20260620-xxx/
    │   └── breadcrumb.jsonl # 真源
    ├── T-20260621-yyy/
    │   └── breadcrumb.jsonl # 真源
    └── done/
        └── T-20260619-zzz/
            └── breadcrumb.jsonl # 归档时保留完整历史
```

## 兼容性

- **向后兼容**：readBreadcrumb 降级读取遗留全局文件
- **迁移期**：新写入只写任务级，旧全局文件作为只读备份
- **完全迁移后**：可删除全局文件

## 性能考量

- **写入**：O(1) - 直接追加任务级文件
- **读取（有活跃任务）**：O(1) - 直接读取当前任务文件
- **读取（idle，聚合）**：O(n×m) - n=任务数(~20), m=平均条数(~10) = ~200 条，可接受
- **归档**：O(1) - 任务级文件随目录移动，无需拷贝

## 测试验证

运行测试套件：
```bash
npm run build
npm run typecheck
```

手动验证：
```bash
# 写入测试
node -e "import('./dist/engine/breadcrumb.js').then(m => 
  m.writeBreadcrumb(process.cwd(), {
    taskId: 'T-TEST', 
    step: 'test', 
    status: 'done', 
    context: 'test'
  })
)"

# 读取测试
node -e "import('./dist/engine/breadcrumb.js').then(m => 
  m.readBreadcrumb(process.cwd()).then(s => 
    console.log('Total:', s.total)
  )
)"
```

## 相关文件

- `src/engine/breadcrumb.ts` - 核心实现
- `src/commands/migrate-breadcrumb.ts` - 迁移命令
- `src/commands/register/runtime-tools.ts` - CLI 注册

## 参考

- 原始双写实现: `src/engine/breadcrumb.ts:418` (已移除)
- 聚合实现: `src/engine/breadcrumb.ts:344-374`
- 迁移日期: 2026-06-24
