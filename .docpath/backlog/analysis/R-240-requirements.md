# R-240 需求分析 (requirements)

## 1. 目标与背景

把 `docs/product-panorama.md §2.2 记忆层` 的宣称与实现对齐，并修补三个真实实现缺口，使"记忆层"名副其实：任务收尾的决策/教训真正固化、ADR 真正能被后续会话查到、上下文检索措辞不误导。

背景：§2.2 当前宣称"自动归档最终决策、踩坑教训和新 API 契约""高精度局部上下文检索"，但核对（见 `memory-layer-optimization-evidence.md`）显示：
- "新 API 契约"完全未实现（journal 无相关代码）。
- "自动归档"实为"命中才归档"——ADR 提取靠脆弱双正则（journal.ts:70），多数任务提取为空。
- reveal/context 不主动展示相关 ADR，"防止反复争论"是愿望非强制。
- "高精度检索"实为关键词+同义词+启发式打分的子串匹配。

## 2. 用户/角色/触发场景

- **Agent（主用户）**：任务收尾时 journal 应可靠固化决策；新会话 reveal/context 某主题时应看到历史 ADR，避免反复争论已定设计点。
- **人类开发者**：读 §2.2 时不被误导；查 decisions 时能看到完整、不漏的 ADR。
- **触发场景**：①任务 done→journal；②新会话 `docpath reveal --topic X` / `docpath context --topic X`；③读文档了解能力边界。

## 3. 功能需求矩阵

| 需求 | 优先级 | 验收 | 依赖 |
|---|---|---|---|
| FR-1: 文档降调——删"新 API 契约"、改"自动归档"→"任务收尾时归档"、"高精度检索"→"按主题过滤的上下文检索" | P1 | §2.2 措辞与实现对齐，无未实现宣称 | 无 |
| FR-2: ADR 提取源改用 spec.json `decision_brief`（推荐方案/不做什么字段），breadcrumb 双正则降级为兜底 | P1 | 同一任务从 brief 提取的 ADR ≥ 现正则提取数；brief 缺失时回退正则不报错 | spec.json decision_brief 已存在 |
| FR-3: reveal/context 命中主题时附带展示相关 ADR（从 decisions.jsonl 按 category/context 匹配） | P2 | reveal --topic X 输出含与 X 相关的 ADR 摘要；无相关时静默 | decisions.jsonl 有 category/context 字段 |
| FR-4: （可选）lesson 候选开头去掉"完成 X/Y 步"占位前缀，仅当有 ADR/brief/blocked 时写 | P3 | 无实际内容的任务不产生 lesson 候选 | FR-2 |

## 4. 非功能需求

- **兼容性**：decisions.jsonl schema 不变；reveal/context `--agent` YAML 字段 append-only。
- **可观测性**：ADR 提取从 brief vs 正则的命中数差异可追溯（debug 日志）。
- **性能**：reveal/context 增加 ADR 查询不显著拖慢（decisions.jsonl 75 条，线性扫描可接受）。
- **可测性**：FR-2/3/4 均可单元测试（造 spec.json + decisions.jsonl fixture）。

## 5. 范围边界与明确不做

- **包含**：§2.2 文档降调；ADR 提取源切换；reveal/context 附带 ADR；lesson 占位收敛。
- **不做**：
  - 不实现"新 API 契约"自动提取（删宣称，非实现）——留作未来 backlog。
  - 不引入 embedding/向量检索（"高精度"降调即可，不上重型方案）。
  - 不改 decisions.jsonl schema 或老化归档机制。
  - 不重构 document-index 启发式打分（仅追加 ADR 展示）。
