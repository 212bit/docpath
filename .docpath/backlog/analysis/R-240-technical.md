# R-240 技术分析 (technical)

## 1. 现状精确画面（代码核对到行）

### 1.1 ADR 提取链（journal.ts）——已部分修复

`collectAdrCandidates()`（journal.ts:573-587）已实现三级优先链：

| 优先级 | 来源 | 函数 | 位置 | 可靠性 |
|---|---|---|---|---|
| 1（最高） | spec.json `decision_brief_markdown` 或 spec.md `### Decision Brief` 段落 | `extractAdrFromDecisionBrief()` | journal.ts:145-159 | 高——解析 `推荐方案/推荐/目标` 字段标记 |
| 2 | spec.md `## 4. 关键决策` 表格 | `extractAdrFromKeyDecisionsTable()` | journal.ts:170-191 | 中——依赖表格格式一致 |
| 3（兜底） | breadcrumb `keyDecisions` 行 | `extractArchitectureDecisionCandidates()` | journal.ts:70-100 | 低——双正则（架构词 + 决策词）同时命中才提取 |

**结论**：证据文件中"ADR 提取靠脆弱双正则"的描述**已部分过时**——brief 提取已是一级优先源。但无 brief 的任务仍依赖兜底正则，命中率低。

### 1.2 reveal.ts ADR 展示——展示但非主题相关

```
reveal.ts:347 → getRecentDecisions(cwd, 5)
```

- `getRecentDecisions()`（decisions.ts:482-496）返回 **最后 N 条** ADR（`records.slice(-count)`）
- reveal level 2+ 展示"🧭 相关决策摘要"——但标题说"相关"，实际是"最近"
- **无主题匹配逻辑**：`--topic X` 不影响 ADR 筛选

### 1.3 context.ts ADR 展示——完全缺失

- `context.ts` 不导入 `getRecentDecisions` 或任何 decisions 相关函数
- `context --topic X` 输出包含：状态、breadcrumb、spec、plan、check 证据、规则、文档索引
- **决策历史完全不可见**

### 1.4 DecisionJsonlRecord 结构

```typescript
// decisions.ts:41-53
interface DecisionJsonlRecord {
  schema_version: number;
  kind: 'decision';
  id: string;           // ADR-YYYYMMDD-HHMMSS
  taskId: string;
  createdAt: string;
  category: string;     // 粗粒度：architecture, policy.skip 等
  context: string;      // 自由文本——描述决策背景
  decision: string;     // 决策内容
  impact: string;
  alternatives: string[];
  relatedFiles: string[];
}
```

**关键**：`category` 是粗粒度的，`context` 是自由文本。没有 `topic_tags` 字段。按主题匹配需复用 document-index 的同义词+子串匹配方法。

### 1.5 主题匹配现有机制（可复用）

`topic-synonyms.ts` 提供 `normalizeTopic(topic)` → 返回同义词数组（如 `normalizeTopic('architecture')` → `['architecture', '架构', '设计', 'design', '结构']`）。

`document-index.ts:368-383` 的匹配逻辑：
```typescript
const synonymSet = normalizeTopic(topic);
const searchableText = [path, type, kind, scope, title, summary, task_id, ...topic_tags].join(' ').toLowerCase();
topicMatched = synonymSet.some(synonym => searchableText.includes(synonym.toLowerCase()));
```

**可复用于 ADR 匹配**：将 `DecisionJsonlRecord` 的 `category + context + decision` 拼接为可搜索文本，用同样的同义词子串匹配。

### 1.6 §2.2 当前措辞（需降调）

```
docs/product-panorama.md:58  "将每次任务的最终决策、踩坑教训和新 API 契约自动归档"
docs/product-panorama.md:59  "记录架构决策记录 (ADR)，防止 AI 在多次会话中针对同一个设计点反复争论"
docs/product-panorama.md:60  "提供高精度的局部上下文检索"
```

## 2. 实现方案（按优化点）

### 优化点 1：§2.2 文档降调

**改动文件**：`docs/product-panorama.md`（3 行文本修改）

| 原文 | 改为 | 理由 |
|---|---|---|
| "最终决策、踩坑教训和新 API 契约自动归档" | "最终决策和踩坑教训归档" | "新 API 契约"完全未实现；`archiveMode` 默认 `skip`，非"自动" |
| "防止 AI 在多次会话中针对同一个设计点反复争论" | "记录 ADR 供后续会话参考，减少重复争论风险" | 当前是被动展示，非强制阻止 |
| "高精度的局部上下文检索" | "按主题过滤的上下文检索" | 实际是同义词+子串匹配，非"高精度" |

**风险**：无。纯文档修改。

### 优化点 2：ADR 提取——验证与加固

**现状评估**：三级链已就位（brief > 决策表 > breadcrumb），`extractAdrFromDecisionBrief` 已实现。

**需要做的**：
1. **验证**：运行现有 journal 测试，确认 brief 提取路径有测试覆盖
2. **补测试**：若无 brief 提取的单元测试，补充（造 fixture：spec.json 含 `major_change_gate.decision_brief_markdown`）
3. **可选加固**：当 brief 和决策表都为空时，日志输出 `⚠️ 无 brief/决策表，仅依赖 breadcrumb 正则`（提高可观测性）

**不改**：不改变三级优先链本身——它已经是正确的。

### 优化点 3：reveal/context 主题相关 ADR 展示（核心工作）

#### 3a. 新增 `getTopicRelevantDecisions()` 函数

**文件**：`src/governance/decisions.ts`

```typescript
export async function getTopicRelevantDecisions(
  cwd: string,
  topic: string,
  maxResults: number = 3,
): Promise<string[]> {
  // 1. 读取 decisions.jsonl
  // 2. 对每条 record，构建 searchableText = category + context + decision
  // 3. 用 normalizeTopic(topic) 同义词集做子串匹配
  // 4. 返回匹配的 record 的 renderDecision() 结果（最多 maxResults 条）
  // 5. 无匹配时返回空数组
}
```

**匹配策略**：
- 可搜索文本：`${category} ${context} ${decision}`.toLowerCase()
- 匹配：`normalizeTopic(topic)` 返回的同义词数组中任一个命中子串即算匹配
- 排序：匹配同义词数量降序（匹配越多越相关），同分则按 createdAt 降序（新的优先）
- 上限：默认 3 条（避免 token 膨胀）

#### 3b. 改造 reveal.ts

**文件**：`src/commands/reveal.ts:347-353`

当前逻辑：
```typescript
const decisions = await getRecentDecisions(cwd, 5);
```

改为：
```typescript
const topic = options.topic; // reveal 已有 --topic 参数
let decisions: string[];
if (topic) {
  decisions = await getTopicRelevantDecisions(cwd, topic, 3);
  // 无主题匹配结果时，回退到最近 3 条（保持信息量）
  if (decisions.length === 0) decisions = await getRecentDecisions(cwd, 3);
} else {
  decisions = await getRecentDecisions(cwd, 5);
}
```

**标题调整**：有 topic 时改为"🧭 主题相关决策 (topic: X)"，无 topic 时保持"🧭 最近决策摘要"。

#### 3c. 改造 context.ts

**文件**：`src/commands/context.ts`

在 section 7（文档索引）之前，新增 section 6.5：

```typescript
// ── 6.5 主题相关 ADR ──
if (options.topic) {
  const topicDecisions = await getTopicRelevantDecisions(cwd, options.topic, 3);
  if (topicDecisions.length > 0) {
    sections.push(
      `## 主题相关决策 (topic: ${options.topic})\n` +
      topicDecisions.map(d => compressMarkdown(d, 200)).join('\n---\n')
    );
  }
}
```

**token 预算**：3 条 ADR × ~200 字符 ≈ 600 字符 ≈ 200 token，在默认 15000 token 预算内可忽略。

#### 3d. 测试策略

- **单元测试**（`tests/decisions.test.mjs` 或新文件 `tests/topic-decisions.test.mjs`）：
  - fixture：造含 5-10 条 `DecisionJsonlRecord` 的临时 `decisions.jsonl`
  - 用例 1：topic="architecture" 命中 category="architecture" 的记录
  - 用例 2：topic="设计" 通过同义词命中 context 含 "design" 的记录
  - 用例 3：无匹配时返回空数组
  - 用例 4：decisions.jsonl 不存在时返回空数组（不报错）

### 优化点 4：lesson 候选占位收敛

**现状**：`writeLessonCandidate`（journal.ts:488+）已有内容检查逻辑（ADR 摘要 + brief 推荐 + blocked 步骤），但开头可能仍有"完成 X/Y 步"占位。

**改动**：当无 ADR 候选、无 brief、无 blocked 步骤时，跳过 lesson 候选写入（不产生空壳 lesson）。

**风险**：低。仅影响 lesson-candidates.md 的写入条件。

## 3. 依赖与兼容性

| 维度 | 影响 |
|---|---|
| decisions.jsonl schema | **不变**——不新增字段，复用现有 category/context/decision |
| reveal --agent YAML | **append-only**——新增 `topic_decisions` 字段（若有） |
| context --agent YAML | **append-only**——新增 `topic_decisions` 字段（若有） |
| journal.ts | 不改提取链——仅可选增加日志 |
| topic-synonyms.ts | 复用 `normalizeTopic()`，不新增同义词组 |
| 性能 | decisions.jsonl 当前 ~75 条，线性扫描 <1ms，可忽略 |

## 4. 实现顺序建议

| 步骤 | 内容 | 预估 | 风险 |
|---|---|---|---|
| S1 | §2.2 文档降调（优化点 1） | 10 min | 无 |
| S2 | 新增 `getTopicRelevantDecisions()` + 单元测试 | 30 min | 低 |
| S3 | 改造 reveal.ts 使用主题 ADR | 15 min | 低 |
| S4 | 改造 context.ts 添加 ADR 段 | 15 min | 低 |
| S5 | 验证 ADR 提取链测试覆盖（优化点 2） | 15 min | 无 |
| S6 | lesson 候选占位收敛（优化点 4） | 10 min | 低 |
| S7 | 集成测试 + `docpath check` | 15 min | 无 |

**总计**：~2 小时
