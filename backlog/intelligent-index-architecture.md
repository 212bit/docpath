# 智能索引架构：CLI 返回索引，Agent 按需深读

## 需求背景

当前架构设计存在矛盾：
- **控制 vs 能力**：完全禁止 Agent 读文件会限制其能力，但完全放开会破坏架构
- **效率 vs 完整性**：CLI 返回摘要足够日常使用，但某些复杂场景需要完整数据
- **未来适应性**：更聪明的 Agent 需要更多上下文，当前架构可能成为瓶颈

## 目标

设计一个**智能索引架构**，让 Agent 根据任务复杂度自主决定数据获取策略：
1. 简单任务：直接使用 CLI 返回的摘要
2. 复杂任务：CLI 提供文件索引（路径 + schema），Agent 自主选择深读

## 核心设计

### 第一阶段：强制 CLI（建立基线）
- ✅ Agent 只能通过 CLI 读取状态
- ✅ CLI 返回结构化索引
- ✅ 更新 CLAUDE.md 和 skills，移除所有直接文件读取
- ❌ 禁止 Agent 直接 `Read(state.json)`

**验证点**：确保现有工作流在 CLI-only 模式下完整可用

### 第二阶段：索引增强（提供线索）
- ✅ CLI 返回文件索引信息
  ```yaml
  data_index:
    state:
      path: .docpath/workspace/state.json
      schema: StateSchema
      size: 2.5KB
      summary: "task_id, phase, gate, 5 steps"
    breadcrumb:
      path: .docpath/workspace/breadcrumb.jsonl
      schema: BreadcrumbLineSchema
      line_count: 127
      recent_lines: 20  # CLI 已返回最近 20 条
      summary: "last step: S5 completed 2min ago"
  ```
- ✅ Agent 看到索引，但还不能直接读

**验证点**：Agent 能理解数据结构，为下阶段准备

### 第三阶段：按需深读（智能决策）
- ✅ Agent 可以根据索引决定是否深读
- ✅ 更新 CLAUDE.md 允许按需直接读取（只读）
  ```markdown
  ## 数据访问协议

  ### 标准路径（日常使用）
  - `docpath status --agent` 返回摘要 + 索引
  - 80% 场景足够使用

  ### 深度访问（复杂场景）
  - 当 CLI 摘要不足时，根据 data_index 直接读取
  - 示例：`Read('.docpath/workspace/state.json')`
  - **限制**：只读，禁止 Edit/Write

  ### 绝对禁止
  - 直接写文件（破坏并发安全）
  ```

**验证点**：
- 简单任务不触发深读（效率）
- 复杂任务能正确识别并深读（能力）

## 成功标准

### 架构层面
- [ ] CLI 是唯一写入接口（强制约束）
- [ ] 读取有分级：摘要 → 索引 → 完整数据（按需递进）
- [ ] Agent 能自主判断复杂度并选择策略

### 性能层面
- [ ] 简单任务 0 次文件直读（减少 IO）
- [ ] 复杂任务 1-3 次精确深读（避免盲读）
- [ ] CLI 响应时间 < 100ms（快速索引）

### 智能层面
- [ ] Agent 能解释为什么需要深读（可审计）
- [ ] 未来更强 Agent 无需改架构（可扩展）

## 风险与对策

### 风险 1：Agent 滥用深读
**对策**：
- 在 CLAUDE.md 中明确"深读需要理由"
- CLI 返回的摘要足够丰富，减少深读需求
- 未来可加审计日志（监控深读频率）

### 风险 2：索引维护成本
**对策**：
- 索引自动生成（`fs.statSync` + schema 引用）
- 不是手工维护的元数据

### 风险 3：并发冲突
**对策**：
- 深读是只读操作，不影响并发安全
- 写操作永远走 CLI（带锁）

## 实现步骤

### Phase 1: 强制 CLI（预计 2h）
1. 审计 CLAUDE.md，移除所有 `current.md` / `breadcrumb.md` 引用
2. 审计 skills 目录，移除所有 `Read(.docpath/workspace/)`
3. 更新协议：禁止 Agent 直接读文件
4. 测试现有工作流

### Phase 2: 索引增强（预计 3h）
1. 设计 `data_index` schema
2. 在 `docpath status --agent` 中实现索引返回
3. 在 CLI 层自动附加文件元信息（path, size, schema）
4. 文档化索引格式

### Phase 3: 按需深读（预计 2h）
1. 更新 CLAUDE.md，解除只读限制
2. 编写最佳实践示例（何时深读、如何深读）
3. 测试复杂场景（Agent 自主决策）
4. 归档设计决策到 decisions.md

## 附录：索引格式示例

```typescript
interface DataIndex {
  state: {
    path: string;           // .docpath/workspace/state.json
    schema: string;         // StateSchema（链接到 schema 文档）
    size_kb: number;        // 2.5
    summary: string;        // "L2 task, executing phase, 3/5 done"
  };
  breadcrumb: {
    path: string;           // .docpath/workspace/breadcrumb.jsonl
    schema: string;         // BreadcrumbLineSchema
    line_count: number;     // 127
    recent_count: number;   // 20（CLI 已返回）
    summary: string;        // "last: S5 done 2min ago"
  };
  plan?: {
    path: string;           // .docpath/tasks/T-xxx/plan.md
    size_kb: number;
    summary: string;        // "5 steps, 3 done, 2 pending"
  };
}
```

## 参考资料

- Memory: `docpath-concurrent-agent-clobber.md` — 并发冲突经验
- CLAUDE.md 当前版本 — 需要更新的协议文档
- `src/commands/status.ts` — CLI 实现入口
