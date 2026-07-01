# R-240 待解决问题 (open-questions)

## Q1: 主题匹配粒度——category 还是全文？

**背景**：`DecisionJsonlRecord` 有 `category`（粗粒度，如 `architecture`、`policy.skip`）和 `context`/`decision`（自由文本）。

**选项**：
- A) 仅匹配 `category`：精确但召回低（很多 ADR 的 category 不够细分）
- B) 匹配 `category + context + decision` 全文：召回高但可能误命中
- C) 匹配 `category + context`（不含 decision）：折中

**推荐**：**B**——与 document-index 的匹配策略一致，且限 3 条 + 回退策略可控制误命中。

## Q2: 无主题时 reveal 是否仍展示 ADR？

**背景**：当前 reveal level 2+ 无 topic 时展示最近 5 条 ADR。

**选项**：
- A) 保持现状（无 topic → 最近 5 条）
- B) 无 topic 时也展示最近 3 条（减少噪音）
- C) 无 topic 时不展示 ADR（仅在有 topic 时才展示）

**推荐**：**A**——保持向后兼容，无 topic 时行为不变。

## Q3: context.ts 是否应在无 topic 时也展示 ADR？

**背景**：context 命令当前完全不展示 ADR。

**选项**：
- A) 仅在有 `--topic` 时展示主题相关 ADR
- B) 无 topic 时也展示最近 3 条 ADR（与 reveal 对齐）

**推荐**：**A**——context 是预算制上下文包，无 topic 时不增加额外噪音；有 topic 时才补充相关决策。

## Q4: 是否需要为 decisions.jsonl 新增 topic_tags 字段？

**背景**：当前 ADR 记录无 `topic_tags`，主题匹配依赖同义词+子串。

**选项**：
- A) 不新增——复用同义词子串匹配，与 document-index 策略一致
- B) 新增 `topic_tags` 字段，ADR 写入时自动从 category/context 提取标签

**推荐**：**A**——不引入 schema 变更（R-240 明确不做 schema 改动）；子串匹配在 75 条规模下足够。留作未来 backlog。
