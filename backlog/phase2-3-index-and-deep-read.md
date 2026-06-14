# Phase 2&3: 索引增强 + 按需深读

## 背景

Phase 1 已完成 CLI-only 基线，建立了"Agent 只通过 CLI 读写状态"的架构约束。

现在需要完成 Phase 2（索引增强）和 Phase 3（按需深读），让 Agent 在保持架构约束的前提下，获得按需深读的能力。

## Phase 2: 索引增强（提供线索）

### 目标
CLI 返回结构化索引，Agent 能看到数据结构，但还不能直接读。

### 实现要点

1. **设计 data_index schema**
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

2. **增强 `docpath status --agent` 输出**
   - 在现有输出基础上增加 `data_index` 字段
   - 自动附加文件元信息（`fs.statSync` + schema 引用）
   - 保持性能：索引生成时间 < 100ms

3. **文档化索引格式**
   - 在 CLAUDE.md 中说明索引结构
   - 提供示例输出

### 验收标准
- [ ] `docpath status --agent` 返回 `data_index` 字段
- [ ] 索引包含 state.json, breadcrumb.jsonl, plan.md 等文件信息
- [ ] 索引生成不影响 CLI 性能（< 100ms）
- [ ] CLAUDE.md 中有索引格式文档

---

## Phase 3: 按需深读（智能决策）

### 目标
Agent 可以根据索引决定是否深读，更新 CLAUDE.md 允许按需直接读取（只读）。

### 实现要点

1. **更新 CLAUDE.md 数据访问协议**

   在现有"📊 数据访问协议"章节中，增加 Phase 3 规则：

   ```markdown
   ### 访问规则（Phase 3 - 按需深读）

   - ✅ **标准路径**：通过 CLI 读取状态（`docpath status --agent`）
     - 80% 场景足够使用

   - ⚠️ **深度访问**（复杂场景）：
     - 当 CLI 摘要不足时，根据 `data_index` 直接读取
     - 示例：`Read('.docpath/workspace/state.json')`
     - **限制**：只读，禁止 Edit/Write
     - **要求**：需要说明为什么 CLI 摘要不够用

   - ❌ **绝对禁止**：
     - 直接写文件（破坏并发安全）
     - 绕过 CLI 写状态
   ```

2. **编写最佳实践示例**

   在 CLAUDE.md 中增加"何时深读"章节：

   ```markdown
   ### 何时需要深读

   **简单任务（不需要深读）**：
   - 查看当前任务 ID → CLI 摘要足够
   - 查看当前 phase → CLI 摘要足够
   - 查看进度 → CLI 摘要足够

   **复杂任务（可能需要深读）**：
   - 调试状态机异常 → 需要完整 state.json
   - 分析执行历史模式 → 需要完整 breadcrumb.jsonl
   - 深度分析计划完成度 → 需要完整 plan.md

   **深读示例**：
   ```typescript
   // 错误：不需要深读却直接读
   Read('.docpath/workspace/state.json')  // CLI 摘要已经有 task_id

   // 正确：CLI 摘要不够，说明理由后深读
   // 理由：需要分析完整的 breadcrumb 历史以定位重复失败的步骤
   Read('.docpath/workspace/breadcrumb.jsonl')
   ```
   ```

3. **验证智能决策**
   - 测试简单任务：Agent 不触发深读
   - 测试复杂任务：Agent 能正确识别并深读

### 验收标准
- [ ] CLAUDE.md 明确分级权限：写操作必须走 CLI，读操作推荐 CLI，允许深读（只读）
- [ ] 编写"何时深读"最佳实践，包含正反例
- [ ] Agent 能解释为什么需要深读（可审计）
- [ ] 验证：简单任务不触发深读，复杂任务能正确深读

---

## 实施建议

### 顺序
1. **Phase 2 先行**（索引增强）
   - 增强 CLI 输出
   - 文档化索引格式
   - Agent 看到但还不能用

2. **Phase 3 跟进**（解除限制）
   - 更新协议允许深读
   - 编写最佳实践
   - 验证智能决策

### 工作量估算
- **Phase 2**: 约 3h
  - CLI 代码实现：1.5h
  - 文档化：1h
  - 测试验证：0.5h

- **Phase 3**: 约 2h
  - CLAUDE.md 更新：1h
  - 最佳实践编写：0.5h
  - 验证测试：0.5h

- **总计**: 约 5h

---

## 风险控制

### Phase 2 风险
- 索引生成拖慢 CLI → 对策：使用缓存，按需生成
- 索引维护成本高 → 对策：自动生成，不手工维护

### Phase 3 风险
- Agent 滥用深读 → 对策：文档要求说明理由，未来可加审计
- 破坏架构约束 → 对策：只允许只读，写操作永远走 CLI

---

## 成功标准

完成后应达到：

1. **架构层面**
   - ✅ CLI 是唯一写入接口（强制约束）
   - ✅ 读取有分级：摘要 → 索引 → 完整数据（按需递进）
   - ✅ Agent 能自主判断复杂度并选择策略

2. **性能层面**
   - ✅ 简单任务 0 次文件直读（减少 IO）
   - ✅ 复杂任务 1-3 次精确深读（避免盲读）
   - ✅ CLI 响应时间 < 100ms（快速索引）

3. **智能层面**
   - ✅ Agent 能解释为什么需要深读（可审计）
   - ✅ 未来更强 Agent 无需改架构（可扩展）

---

## 附录：Phase 1 回顾

Phase 1 已完成的工作：
- ✅ CLAUDE.md 协议更新（7 处）
- ✅ .docpath/commands/ 更新（6 个文件）
- ✅ 建立 CLI-only 基线
- ✅ 所有 Agent 指令通过 CLI 获取状态

Phase 2&3 是在这个基线上的增强，不破坏已有约束。
