## 执行计划

### S1: 梳理删除/瘦身边界（审计结论落 spec）
- [x] S1: 梳理删除/瘦身边界（审计结论落 spec）
- **描述**: 确认消费方清单与删除范围；project:/trace: 经复核为活配置需保留。
- **验收条件**: spec FR/AC/Decision Brief 完整
- **依赖**: 无

### S2: FR-1 删除 docs.md（生成下线 + 消费切换 + 特判简化）
- [x] S2: FR-1 删除 docs.md（生成下线 + 消费切换 + 特判简化）
- **描述**: writeDocsIndexes 停写 docs.md；docs list --full 从索引渲染；docs add 纯索引化；git-dirty-guard/changes-report 的 docs.md 特判删除（docs-index.json 保留）；reveal 兼容读取保留；主仓 git rm docs.md；merge-driver/.gitattributes 保留 docs.md 兼容。
- **验收条件**: docs.md 不再生成；docs list --full 内容等价；全量测试绿
- **依赖**: S1

### S3: FR-2 索引瘦身
- [x] S3: FR-2 索引瘦身
- **描述**: compactIndexEntry 对 archive=true 条目不落 summary/content_terms；live 条目 content_terms 限 16 词；重跑 scan 验证体积。
- **验收条件**: 索引 ≤700KB；reveal topic 对 live 文档搜索行为不变；测试绿
- **依赖**: S2

### S4: FR-3 惰性配置删除
- [x] S4: FR-3 惰性配置删除
- **描述**: types/config.ts 删 workflow.auto_*/project_commands；init.ts 停写 default_level/workflow.auto_*/paths/project_commands（保留 project/trace/document_scan_paths/agent_flow）；更新 init.test 断言。
- **验收条件**: grep 零死字段写入；init 生成 config 仅含活字段；测试绿
- **依赖**: S1

### S5: FR-4 legacy 清理
- [x] S5: FR-4 legacy 清理
- **描述**: git rm archive/docs-legacy-20260613.md 与 spec-legacy/；worktree prune（仅 merged_to_main=true）。
- **验收条件**: 归档删除；在制品树（feature-project-scan 等）不受影响
- **依赖**: S1

### S6: 验证与收口
- [x] S6: 验证与收口
- **描述**: 全量 typecheck/test/check/review；重跑 docs scan 落地瘦身索引；commit/merge。
- **验收条件**: 全绿；索引与仓库体积下降数据记入任务结果
- **依赖**: S2,S3,S4,S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
