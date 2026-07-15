## 执行计划

### S1: 梳理 Memory Indexing: docpath reveal 升级为内容检索
- [x] S1: 梳理 Memory Indexing: docpath reveal 升级为内容检索
- **描述**: 根据 spec 明确 FR-1: Memory Indexing: docpath reveal 升级为内容检索 的实现边界和验收口径。
- **验收条件**: AC-1: `docpath docs scan` 为 Markdown 文档建立 compact 内容词索引，使正文关键词可被 topic 查询命中。
- **依赖**: 无

### S2: 实现 Memory Indexing: docpath reveal 升级为内容检索
- [x] S2: 实现 Memory Indexing: docpath reveal 升级为内容检索
- **描述**: 在现有架构内完成 FR-1: Memory Indexing: docpath reveal 升级为内容检索 的代码与文档更新。
- **验收条件**: FR-1 Memory Indexing: docpath reveal 升级为内容检索 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `docpath docs scan` 为 Markdown 文档建立 compact 内容词索引，使正文关键词可被 topic 查询命中。；AC-2: `docpath reveal --topic <keyword>` 能命中正文中出现、但 path/title/summary 均未出现的关键词。；AC-3: `docpath context --topic <keyword>` 复用同一索引匹配语义，不回退到运行时全文 grep。；AC-4: 索引仍保持 compact：不写入全文正文，默认不输出 `topic_tags`，归档正文展开策略保持不变。；AC-5: 现有 topic synonym 行为保持不变。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-257 与任务 T-20260715-memory-indexing-docpath-reveal 建立双向关联
- **验收条件**: AC-1: `docpath docs scan` 为 Markdown 文档建立 compact 内容词索引，使正文关键词可被 topic 查询命中。；AC-2: `docpath reveal --topic <keyword>` 能命中正文中出现、但 path/title/summary 均未出现的关键词。；AC-3: `docpath context --topic <keyword>` 复用同一索引匹配语义，不回退到运行时全文 grep。；AC-4: 索引仍保持 compact：不写入全文正文，默认不输出 `topic_tags`，归档正文展开策略保持不变。；AC-5: 现有 topic synonym 行为保持不变。；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-257 与任务 T-20260715-memory-indexing-docpath-reveal 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
