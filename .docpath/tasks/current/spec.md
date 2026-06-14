# T-20260614-phase-2-3 - Phase 2&3: 索引增强 + 按需深读

> backlog_id: R-167
> backlog_source: docpath backlog add

## 1. 背景与动机

Phase 1 已完成 CLI-only 基线，建立了"Agent 只通过 CLI 读写状态"的架构约束。所有 Agent 指令都通过 CLI 获取状态，不再直接读取 current.md/breadcrumb.md。

现在需要完成 Phase 2（索引增强）和 Phase 3（按需深读），让 Agent 在保持架构约束的前提下，获得按需深读的能力，解决"控制 vs 能力"的矛盾。

## 2. 需求清单

### 功能需求

- [ ] FR-1: Phase 2 - 索引增强
  - 设计 `data_index` schema（path, schema, size_kb, line_count, summary）
  - 增强 `docpath status --agent` 输出，在现有基础上增加 `data_index` 字段
  - CLI 自动附加文件元信息（`fs.statSync` + schema 引用）
  - 在 CLAUDE.md 中文档化索引格式，提供示例输出

- [ ] FR-2: Phase 3 - 按需深读
  - 更新 CLAUDE.md "📊 数据访问协议"章节，增加 Phase 3 规则（允许按需深读）
  - 明确约束：写操作必须走 CLI（强制），读操作推荐 CLI，允许深读（只读）
  - 在 CLAUDE.md 中增加"何时深读"章节，编写最佳实践和正反例
  - 验证：简单任务不触发深读，复杂任务能正确识别并深读

### 非功能需求

- [ ] NFR-1: CLI 响应时间 < 100ms（索引生成不能拖慢 status 命令）
- [ ] NFR-2: 向后兼容现有 DocPath 工作流（不破坏已有 skills 和 CLI 命令）
- [ ] NFR-3: 索引自动生成（不需要手工维护元数据）
- [ ] NFR-4: 写操作仍然必须走 CLI（保证并发安全和审计日志）

## 3. 范围界定

### 包含
- Phase 2: CLI 索引返回逻辑（`status --agent` 输出增强）
- Phase 3: CLAUDE.md 按需深读协议（分级权限 + 最佳实践）
- 索引格式文档化（在 CLAUDE.md 中）
- 验证测试（简单任务 vs 复杂任务）

### 不包含
- 不改变底层存储格式（JSON/JSONL 已在 R-164 完成）
- 不添加审计日志（未来可选特性）
- 不限制 Agent 读取频率（只在文档层面建议）
- 不处理 skills 的自动化测试（超出本任务范围）
- 不改变 Phase 1 已建立的 CLI-only 约束

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Phase 2&3 合并实施 | 分两个任务 / 合并为一个任务 | 合并为一个任务 | Phase 2 是 Phase 3 的基础，合并减少切换成本 |
| 2 | 索引生成时机 | 实时生成 / 缓存 / 按需生成 | 实时生成 | 保证索引总是最新，性能足够（< 100ms） |
| 3 | 深读权限边界 | 完全禁止 / 只读允许 / 完全放开 | 只读允许 | 平衡控制与能力，写操作走 CLI 保证安全 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] API / 数据契约（CLI 输出增加 data_index）
- [x] 架构 / 模块边界
- [x] 工作流 / Agent 行为（允许按需深读）
- [x] 权限 / 写操作边界

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: Phase 1 建立了 CLI-only 基线，但完全禁止 Agent 读文件会限制其能力。
- 目标: 在保持架构约束（写操作走 CLI）的前提下，给 Agent 按需深读的能力。
- 背景: Phase 1 已完成，需要继续完成智能索引架构的 Phase 2&3。
- 可选方案:
  1. 继续完全禁止 → 限制 Agent 能力
  2. 索引增强 + 按需深读 → 平衡方案
  3. 完全放开 → 破坏架构
- 推荐方案: 方案 2，先索引增强（Phase 2），再解除只读限制（Phase 3）
- 不做什么: 不改底层存储，不加审计日志，不限制读频率，不改 Phase 1 约束
- 成本: Phase 2 约 3h，Phase 3 约 2h，总计约 5h
- 风险: Agent 可能滥用深读 → 在文档层面要求说明理由
- 回滚方案: Phase 2&3 可独立回滚，不影响 Phase 1 的 CLI-only 基线
- 用户确认: 用户已确认合并实施 Phase 2&3

## 5. 验收标准

- [ ] AC-1: `docpath status --agent` 返回 `data_index` 字段，包含 state.json, breadcrumb.jsonl, plan.md 等文件信息
- [ ] AC-2: 索引生成不影响 CLI 性能（< 100ms）
- [ ] AC-3: CLAUDE.md 中有索引格式文档和示例输出
- [ ] AC-4: CLAUDE.md "📊 数据访问协议"增加 Phase 3 规则（分级权限）
- [ ] AC-5: CLAUDE.md 增加"何时深读"章节，包含正反例
- [ ] AC-6: 验证：简单任务（查看 task_id/phase）不触发深读
- [ ] AC-7: 验证：复杂任务（调试状态机、分析历史）能正确识别并深读
- [ ] AC-8: backlog 条目 R-167 与任务 T-20260614-phase-2-3 建立双向关联并完成归档

## 6. 风险与依赖

### 依赖
- Phase 1 已完成（CLI-only 基线）
- 现有 CLI 架构支持输出格式扩展

### 风险
1. **索引生成性能** → 对策：使用同步 fs.statSync，避免异步开销
2. **Agent 滥用深读** → 对策：文档要求说明理由，未来可加审计日志
3. **破坏架构约束** → 对策：只允许只读，写操作永远走 CLI

---

*此文件由 `docpath write-spec` 写入。*
