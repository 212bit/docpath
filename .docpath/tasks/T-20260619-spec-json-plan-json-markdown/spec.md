# T-20260619-spec-json-plan-json-markdown - 消除 spec.json/plan.json 内嵌 markdown 字段冗余

> backlog_id: R-218
> backlog_source: docpath backlog add

## 1. 背景与动机

spec.json 和 plan.json 各自有一个 markdown 字段，内容与同目录 spec.md/plan.md 完全相同（100% 重合，已验证）。write-spec/write-plan 命令写入时双向维护，单次失败产生静默不一致；JSON 体积因此翻倍（spec.json 9.2KB vs spec.md 3.9KB）。

架构分析：markdown 字段在 structured-docs.ts 有两个角色：
1. render*FromDocument 优先返回 doc.markdown（原文保真 cache）
2. normalizeSpecDocument 在结构化字段缺失时 fallback 到 markdown 解析

修复方向：JSON 移除 markdown 字段，readStructuredTaskJsonDocument 读取时同时读取同目录 .md 文件填充内存 markdown，render 函数不变。

## 2. 需求清单

### 功能需求
- [ ] FR-1: writeStructuredTaskJson 写出的 JSON 不含 markdown 字段
- [ ] FR-2: readStructuredTaskJsonDocument 读 JSON 后同时读取 .md 文件，内存补齐 markdown（仅内存，不写回 JSON）
- [ ] FR-3: 现有旧 JSON 有 markdown 字段时读取不报错（向后兼容忽略）

### 非功能需求
- [ ] NFR-1: spec.json 体积降至纯结构化字段大小
- [ ] NFR-2: pnpm test 全量绿

## 3. 范围界定

### 包含
- src/utils/structured-docs.ts: 接口、write、read、validate、render 路径
- 所有读写 spec.json/plan.json 的代码路径

### 不包含
- spec.md/plan.md 文件格式变更
- dashboard-ui 的 review.markdown 字段（不同 doc 类型）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | markdown 字段处理方式 | 完全移除 vs 读取时从 .md 补齐 | 读取时从 .md 补齐（内存只） | render 函数依赖 markdown 字段做原文 cache，内存补齐避免格式损失 |
| 2 | 向后兼容 | 强校验报错 vs 忽略旧字段 | 忽略旧字段 | 旧文件不应因升级读取失败 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [x] 架构 / 模块边界

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）

### Decision Brief
- 当前问题: spec.json 内嵌 markdown 字段与 spec.md 100% 重合，体积翻倍，双写维护风险
- 目标: JSON 只存结构化字段，.md 文件是单一原文真相源
- 背景: 分析确认 markdown 字段仅用于 render*FromDocument 的原文 cache 和 normalize 的 fallback 解析
- 可选方案: (A) 写时移除，读时从 .md 补齐内存 markdown（当前选择）；(B) 完全移除 markdown cache，render 只从结构化字段重建
- 推荐方案: A — 最小变更，render 行为不变，.md 文件成为单一真相
- 不做什么: 不改变 .md 文件格式；不移除 render*FromDocument 逻辑
- 成本: 中等，structured-docs.ts 约 30-50 行变更
- 风险: readStructuredTaskJsonDocument 读取 .md 时文件不存在 → 缓解：fallback 到结构化字段重建
- 回滚方案: git revert 本次提交即可
- 用户确认: 已确认（2026-06-20），用户明确要求修复

## 5. 验收标准

- [ ] AC-1: spec.json/plan.json 不含 markdown 字段（新写入）
- [ ] AC-2: 旧 spec.json 含 markdown 字段时读取不报错
- [ ] AC-3: render*FromDocument 输出内容与 .md 文件一致
- [ ] AC-4: pnpm test 全量绿

---

*此文件由 `docpath write-spec` 更新。*

## Journal Record

### 📝 任务摘要
从 spec.json/plan.json 中移除 markdown 字段（双写冗余），改为写时不含该字段，读时从结构化字段重建内容。

### 🏗️ 架构决策
- spec.json/plan.json 不再包含 markdown 字段：.md 文件是唯一的 Markdown 原文真相源
- readStructuredTaskJsonDocument 读取 JSON 后不从 .md 文件补充 markdown 字段，render 函数从结构化字段重建（"JSON is truth"原则）
- syncActiveTaskFiles 当无 source spec.json 时跳过 writeStructuredTaskJson，避免从 broken markdown 生成新的 JSON 真相源
- markdown 字段改为可选接口，向后兼容旧文件：validateBase 仅检查"若存在则必须是字符串"

### 💡 经验教训
- 接口字段改为可选后需检查所有使用该字段的代码（`doc.markdown.trim()` → `(doc.markdown ?? '').trim()`）
- syncActiveTaskFiles 中"从 markdown 重建 JSON 再重写 md"的逻辑在 broken markdown 场景下会改变内容，需要跳过
- 测试前先确认哪些失败是预先存在的（git stash + pnpm test），避免把旧 bug 归因为新变更

### 🔮 后续改进
- renderSpecMarkdownFromDocument 函数过长（60 行），可考虑拆分为 renderMajorGateSection/renderRequirementsSection 等子函数
- 当 spec.json 存在但 spec.md 不存在时，check 命令应能从 JSON render spec.md（R-218 延伸：check reads spec.json before stale spec.md）
