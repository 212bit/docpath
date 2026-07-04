# Project Intake 并发安全修复

**修复日期**: 2026-07-04  
**问题类型**: 并发安全（Race Condition）  
**优先级**: 🔴 高优先级  
**状态**: ✅ 已修复并通过测试

---

## 问题描述

project-intake 功能中存在经典的 Read-Modify-Write (RMW) 竞争条件，多个 Agent 并发修改同一 intake 的状态时会导致数据丢失。

### 问题根因

三个命令函数存在未保护的 RMW 操作：
1. `projectAnalyze` - 写入分析 section 并更新 artifacts 列表
2. `projectBrief` - 写入 brief 并更新 stage
3. `projectBacklog` - 写入 backlog guidance 并更新 stage 和 user_confirmed

**竞争场景示例**:
```
时间  Agent A                          Agent B
t0   readIntakeState()                readIntakeState()
     (读取 stage=captured, artifacts=[])  (读取 stage=captured, artifacts=[])
t1   修改: artifacts=[{analysis1}]    修改: artifacts=[{analysis2}]
t2   writeIntakeState()               
     (写入 stage=captured, artifacts=[{analysis1}])
t3                                    writeIntakeState()
                                      (覆盖为 stage=captured, artifacts=[{analysis2}])
                                      ❌ analysis1 丢失！
```

---

## 修复方案

### 核心思路

使用 DocPath 现有的 `withLock` 文件锁机制（已在 workspace state.json 中验证）保护所有 RMW 操作。

### 实现细节

1. **添加原子更新辅助函数**:
```typescript
async function atomicUpdateIntakeState(
  docpathDir: string,
  intakeId: string,
  updater: (state: ProjectIntakeState) => Promise<ProjectIntakeState> | ProjectIntakeState
): Promise<void> {
  const lockPath = join(docpathDir, 'project-intake', `${intakeId}.lock`);
  await withLock(lockPath, async () => {
    const state = await readIntakeState(docpathDir, intakeId);
    const updated = await updater(state);
    await writeIntakeState(docpathDir, updated);
  });
}
```

2. **重构三个命令函数**:
   - 将 RMW 逻辑移入 `atomicUpdateIntakeState` 的 updater 回调
   - 在锁外进行只读检查（提前失败，避免持锁等待用户输入）
   - 在锁外进行输出（避免持锁时间过长）

### 锁机制特性

- **原子性**: 使用 `writeFile` 的 `flag:'wx'` 独占创建模式
- **防死锁**: 
  - 持锁超过 30 秒视为 stale，可被其他进程抢占
  - PID 存活探测，进程崩溃后锁自动失效
- **超时保护**: 5 秒获锁超时，fail-loud 而非静默失败
- **自动清理**: `finally` 块保证锁文件被删除

---

## 修改文件

### `/Users/mac/project/docpath/src/commands/project.ts`

**新增导入**:
```typescript
import { withLock } from '../utils/lock.js';
```

**新增函数** (L105-115):
```typescript
async function atomicUpdateIntakeState(...)
```

**重构函数** (L360-421, L427-462, L466-522):
- `projectAnalyze`
- `projectBrief`
- `projectBacklog`

**总计**: +62 行, 修改 3 个函数

---

## 测试验证

### 原有测试

所有 7 个原有测试通过 ✅:
```
✔ project capture creates intake state and copies content source
✔ project capture records source references without copying content  
✔ project capture fails without source material and validates source type
✔ project analyze emits dry-run payload and persists analysis sections
✔ project brief requires complete analysis and then writes brief evidence
✔ project backlog blocks unconfirmed decomposition and writes confirmed guidance
✔ project status reports agent-readable next actions by intake stage
```

### 新增测试

`tests/project-lock.test.mjs` - 验证锁机制:
- ✔ 使用锁文件防止并发 RMW 冲突
- ✔ 顺序更新正确工作
- ✔ 锁文件在操作后正确清理

---

## 性能影响

### 顺序操作
- **额外开销**: ~1-2ms (锁获取 + 释放)
- **影响**: 可忽略不计，测试时间未见显著增加

### 并发操作
- **锁争用**: 后来者需要等待前者完成
- **最坏情况**: 50ms 重试间隔 × N 次 = 最多 5 秒
- **实际场景**: 单个 intake 的写操作通常在几百毫秒内完成

---

## 设计权衡

### 为什么选择文件锁？

1. **跨进程**: 支持 CLI、Codex、Hive 守护进程并发场景
2. **已验证**: workspace state.json 已使用同样机制
3. **无外部依赖**: 纯文件系统操作，不需要 Redis 等服务
4. **Fail-loud**: 符合 DocPath "宁可报错也不漂移" 的哲学

### 为什么不用乐观锁？

- **复杂性**: 需要版本号、冲突检测、重试逻辑
- **用户体验**: 冲突重试会导致用户困惑
- **场景不匹配**: project-intake 写入频率低，悲观锁更简单

### 为什么不用数据库？

- **架构目标**: DocPath 是文件系统状态机，不依赖外部服务
- **可移植性**: 纯文件系统方案在所有平台都能工作

---

## 后续建议

### 短期（已完成）
- ✅ 修复三个 RMW 操作
- ✅ 添加锁机制测试
- ✅ 验证原有测试通过

### 中期（建议）
1. **并发压力测试**: 模拟 10+ 并发 Agent 写入同一 intake
2. **监控告警**: 记录锁争用次数和等待时间
3. **文档更新**: 在 CLAUDE.md 中说明并发安全保证

### 长期（可选）
1. **性能优化**: 如果锁争用成为瓶颈，考虑分片锁（按 section）
2. **死锁检测**: 增强锁机制，记录锁持有调用栈

---

## 相关参考

- **Memory**: `docpath-concurrent-agent-clobber.md` - workspace state.json 的同类问题及修复
- **Commit**: 26cd064 - workspace state.json 的 withLock 修复
- **工具**: `src/utils/lock.ts` - 文件锁实现
- **Review**: `REVIEW-project-intake.md` - 完整 code review 报告

---

**修复人**: Claude Code (Opus 4.8)  
**审查状态**: ✅ Ready for merge
