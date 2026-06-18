# T-20260614-cli-agent - 智能索引架构：CLI 返回索引，Agent 按需深读

> backlog_id: R-166
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 DocPath 架构在 Agent 数据访问权限上存在三重矛盾：

1. **控制 vs 能力**：完全禁止 Agent 读文件会限制其推理能力，但完全放开会破坏架构约束和并发安全
2. **效率 vs 完整性**：CLI 返回摘要足够日常使用，但某些复杂场景（调试、深度分析）需要完整数据
3. **未来适应性**：更聪明的 Agent（GPT-5/Fable 5）需要更多上下文，当前架构可能成为瓶颈

本任务目标是设计**智能索引架构**，让 Agent 根据任务复杂度自主决定数据获取策略，在保证架构约束（写操作走 CLI、并发安全）的前提下，给 Agent 按需深读的能力。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Phase 1 - 建立 CLI-only 基线
  - 更新 CLAUDE.md，移除所有 `current.md` / `breadcrumb.md` 文件引用
  - 更新 skills（/docpath-status, /docpath-continue 等），移除直接 Read 文件的逻辑
  - 协议层明确：Agent 禁止直接读取 `.docpath/workspace/` 下的文件
  - 验证：现有工作流在 CLI-only 模式下完整可用

- [ ] FR-2: Phase 2 - CLI 返回结构化索引
  - 设计 `data_index` schema（path, schema, size_kb, line_count, summary）
  - `docpath status --agent` 返回索引信息（state.json, breadcrumb.jsonl, plan.md 等）
  - CLI 自动附加文件元信息（`fs.statSync` + schema 引用）
  - 文档化索引格式（在 CLAUDE.md 中）

- [ ] FR-3: Phase 3 - 允许按需深读（只读）
  - 更新 CLAUDE.md 数据访问协议，允许 Agent 根据索引直接读取文件（只读）
  - 明确约束：写操作必须走 CLI（强制），读操作推荐 CLI，允许深读（只读）
  - 编写最佳实践示例（何时深读、如何解释理由）
  - 验证：简单任务不触发深读，复杂任务能正确识别并深读

### 非功能需求
- [ ] NFR-1: CLI 响应时间 < 100ms（索引生成不能拖慢 status 命令）
- [ ] NFR-2: 向后兼容现有 DocPath 工作流（不破坏已有 skills 和 CLI 命令）
- [ ] NFR-3: 索引自动生成（不需要手工维护元数据）
- [ ] NFR-4: 写操作仍然必须走 CLI（保证并发安全和审计日志）

## 3. 范围界定

### 包含
- Phase 1: CLAUDE.md 和 skills 的协议更新（移除 MD 文件引用）
- Phase 2: CLI 索引返回逻辑（`status --agent` 输出增强）
- Phase 3: CLAUDE.md 按需深读协议（分级权限）
- 相关测试和文档化

### 不包含
- 不改变底层存储格式（JSON/JSONL 已在 R-164 完成）
- 不添加审计日志（未来可选特性）
- 不限制 Agent 读取频率（只在文档层面建议）
- 不处理 skills 的自动化测试（超出本任务范围）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Agent 读文件权限 | 完全禁止 / 允许深读（只读）/ 完全放开 | 允许深读（只读） | 平衡控制与能力，写操作强制走 CLI 保证安全 |
| 2 | 索引生成方式 | 手工维护 / CLI 自动生成 | CLI 自动生成 | 降低维护成本，索引总是最新 |
| 3 | Phase 执行顺序 | 一次性完成 / 三阶段渐进 | 三阶段渐进 | 每阶段可验证，风险可控 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 架构 / 模块边界
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [x] 长期维护成本增加

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: Agent 数据访问权限在"完全禁止"和"完全放开"之间无中间态，限制能力或破坏架构。
- 目标: 设计智能索引架构，让 Agent 按需深读（只读），写操作强制走 CLI。
- 背景: 用户在对话中提出架构矛盾，要求设计分级权限方案。
- 可选方案:
  1. 完全禁止 Agent 读文件 → 限制能力
  2. 允许按需深读（只读）→ 平衡方案
  3. 完全放开 → 破坏架构
- 推荐方案: 方案 2，三阶段渐进实施（CLI-only → 索引 → 深读）
- 不做什么: 不改底层存储，不加审计日志，不限制读频率
- 成本: 需要更新 CLAUDE.md、多个 skills、CLI status 命令，约 7h
- 风险: Agent 可能滥用深读 → 在文档层面要求说明理由
- 回滚方案: 每个 Phase 独立，可单独回滚
- 用户确认: 用户已确认三阶段方案

## 5. 验收标准

- [ ] AC-1: CLAUDE.md 和 skills 不再引用 `current.md` / `breadcrumb.md`，Agent 通过 CLI 读取状态
- [ ] AC-2: `docpath status --agent` 返回 `data_index` 字段，包含 state.json, breadcrumb.jsonl 等文件的索引信息
- [ ] AC-3: CLAUDE.md 明确分级权限：写操作必须走 CLI，读操作推荐 CLI，允许深读（只读）
- [ ] AC-4: 现有 DocPath 工作流（brainstorm/plan/go/check/review/journal）在新架构下完整可用
- [ ] AC-5: CLI 响应时间 < 100ms（索引生成不拖慢 status 命令）
- [ ] AC-6: 编写最佳实践文档（何时深读、如何解释理由），并集成到 CLAUDE.md
- [ ] AC-7: backlog 条目 R-166 与任务 T-20260614-cli-agent 建立双向关联并完成归档

---

*此文件由 `docpath write-spec` 写入。*
