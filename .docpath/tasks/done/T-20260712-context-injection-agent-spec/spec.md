# T-20260712-context-injection-agent-spec - Context Injection: agent 输出注入 spec 摘要和决策历史

> workflow_profile: standard
> backlog_id: R-256

## 1. 背景与动机

当前 `docpath next --agent` 和 `docpath status --agent` 输出的 YAML 中不包含当前任务的 spec 摘要和最近决策历史。Agent 拿到输出后，为了补全上下文，还需要额外读取 `spec.md` 和 `decisions.md` / `decisions.jsonl`，多出 2-4 次文件读取。

本任务在 agent-output YAML 中增加一个 `context_injection` 区块，自动包含：
- `spec_summary`: 当前活跃 spec 的核心需求摘要（title + 功能需求列表前 5 条）
- `recent_decisions`: 最近 5 条决策记录（来自 decisions.jsonl），包含 id、title、conclusion、timestamp

## 2. 需求清单

### 功能需求
- [ ] FR-1: loadAgentOutputContext() 获取 spec 摘要
- [ ] FR-2: loadAgentOutputContext() 获取最近 5 条 decisions
- [ ] FR-3: agent-output YAML 包含 context_injection 区块
- [ ] FR-4: spec 不存在时 spec_summary 为 null
- [ ] FR-5: decisions.jsonl 不存在或为空时 recent_decisions 为 []
- [ ] FR-6: 不影响现有 YAML 字段，向后兼容

### 非功能需求
- [ ] NFR-1: decisions 读取最多读取 50 行 JSONL，不阻塞主流程
- [ ] NFR-2: spec 摘要只取结构化字段，不全文加载

## 3. 范围界定

### 包含
- 修改 `src/utils/agent-output/formatters.ts`：AgentOutputContext 新增字段 + loadAgentOutputContext 填充
- 修改 `src/utils/agent-output.ts`：YAML 序列化新增 context_injection 区块
- 读取 `decisions.jsonl` 的工具逻辑（内联在 formatters.ts 或新建小函数）

### 不包含
- decisions.md markdown 解析（直接从 decisions.jsonl 结构化数据读取）
- spec 全文语义摘要（仅取结构化字段：title + 功能需求 checklist）
- 修改 spec.json schema
- 修改 decisions.jsonl schema

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec 摘要来源 | spec.json / spec.md | spec.md 中解析 checklist | spec.json 可能不同步，spec.md 是人机可读真源 |
| 2 | decisions 来源 | decisions.md / decisions.jsonl | decisions.jsonl | 已经是结构化 JSON，一行一条，解析零成本 |
| 3 | 新增函数位置 | 新建文件 / 内联 | 内联新建 loadRecentDecisions | 简单到不需要新文件，但抽成独立函数便于测试 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### Decision Brief
- 当前问题: agent-output YAML 缺乏上下文信息，Agent 需要额外读取文件
- 目标: 在 YAML 中注入 spec 摘要和决策历史，减少 Agent 文件读取
- 变更内容: 在 agent-output YAML 增加 context_injection 区块（仅新增字段，不修改现有字段）
- 影响评估: 仅影响 agent-output 的 YAML 序列化，不影响现有工作流状态机、门禁逻辑、文件读写
- 用户确认: 用户已确认本会话中的设计方案，同意在 agent-output YAML 中增加 context_injection 区块

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现

## 5. 验收标准

- [ ] AC-1: docpath next --agent 输出包含 context_injection.spec_summary（当前有活跃 spec 时）
- [ ] AC-2: docpath next --agent 输出包含 context_injection.recent_decisions（有 decisions.jsonl 时）
- [ ] AC-3: spec 不存在时 spec_summary 为 null
- [ ] AC-4: decisions.jsonl 为空时 recent_decisions 为 []
- [ ] AC-5: 现有 YAML 字段完全不变
