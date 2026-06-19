## 执行计划

### S1: 分析 markdown 字段的所有使用路径
- **描述**: 在 structured-docs.ts 中，markdown 字段有两个角色：(1) render*FromDocument 函数优先返回 doc.markdown（原文保真）；(2) normalizeSpecDocument 用 markdown 作为结构化字段的 fallback（当 JSON 缺少 scope/major_change_gate 等时从 markdown 解析）。分析哪些路径可以安全移除 markdown 字段，哪些需要保留兼容层。结论：markdown 字段是原文 cache，可改为从 .md 文件读取（readStructuredTaskJsonDocument 调用时同时读取同目录的 .md 文件）
- **验收条件**: 文档化 markdown 字段的完整使用路径，决策记录在 spec Decision Brief 中
- **依赖**: 无

### S2: JSON 写入时移除 markdown 字段，.md 文件成为单一原文
- **描述**: writeStructuredTaskJson 写 JSON 时不包含 markdown 字段；StructuredDocumentBase 接口 markdown 字段改为可选（`markdown?: string`）；validateSpec/validatePlan 不再要求 markdown 字段存在（改为可选验证）
- **验收条件**: writeStructuredTaskJson 写出的 JSON 不含 markdown 字段；tsc --noEmit 通过；现有 JSON 有 markdown 字段时读取不报错
- **依赖**: S1

### S3: render*FromDocument 改为从 .md 文件读取（或参数传入）
- **描述**: renderPlanMarkdownFromDocument / renderSpecMarkdownFromDocument 当 doc.markdown 为空时，从结构化字段重建（已有 fallback 路径）；readStructuredTaskJsonDocument 读取 JSON 后同时读取同目录 .md 文件填充 markdown 字段（仅内存，不写回 JSON）；write-spec/write-plan 写入流程不变（.md 文件仍然写出）
- **验收条件**: tsc --noEmit 通过；render 函数输出与写入的 .md 文件内容一致
- **依赖**: S2

### S4: pnpm test 全量验证 + 体积确认
- **描述**: pnpm test 全量绿；确认 spec.json 不含 markdown 字段；确认 .md 文件内容不变；docpath check 通过
- **验收条件**: 全量测试绿；spec.json 无 markdown 字段；docpath check 通过
- **依赖**: S1, S2, S3

## Checklist
- [x] S1
- [ ] S2
- [ ] S3
- [ ] S4

## 依赖关系图
S1 → S2 → S3 → S4
