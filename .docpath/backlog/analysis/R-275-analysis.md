# R-275 分析: ArtifactConfig 死字段清理 (2026-07-16, 代码核验)

## 原捕获声明核验

| 声明 | 核验结果 |
| --- | --- |
| keep_workspace_views 全仓无消费方 | **属实**。仅 src/types/config.ts:22(类型)/:65(默认值) 与 docs/workflows/artifact-policy.md:104,123(文档) 出现; 无任何代码读取该字段。 |
| gc 的 workspace 清理硬编码路径, 不按白名单扫 workspace/*.md | **属实**。workspace-cleanup.ts:22 `CleanupArea = 'check-history' \| 'breadcrumb' \| 'sessions' \| 'leases'`, 清理面固定四区域, 从不枚举 workspace/*.md。 |
| "DEFAULT_ARTIFACT_CONFIG 定义后无任何消费方" (标题原话) | **不精确**。DEFAULT_ARTIFACT_CONFIG 经 mergeArtifactConfig → readArtifactConfig (utils/config.ts:39) 有消费链; 死的是其中的**字段**, 且不止 keep_workspace_views 一个 (见下)。 |

## 扩展发现: 同对象共 4/5 字段死 (逐字段消费方核验)

| 字段 | 状态 | 证据 |
| --- | --- | --- |
| generate_md_views | **存活** | structured-docs.ts:687 条件写 MD 视图, 唯一真实消费方 |
| generate_on_demand | 死 | `docpath render` 命令存在 (register/reporting.ts:141) 但无条件注册可用, 从不读此开关; 字段声称控制一个实际恒开的能力 |
| archive_decisions_monthly | 死 | gcDecisions (governance/decisions.ts) 老化时无条件按月归档到 decisions-YYYY-MM.md, 从不读该布尔 |
| decisions_retention_days | **死且误导** | 文档/默认值写 30 天; 实际 gcDecisions `retentionDays ?? 14` (decisions.ts:475), journal.ts:704 强制分支也硬编码 14。配置从未被读取, 文档数字与真实行为矛盾 |
| keep_workspace_views | 死 (R-275 本体) | 见上表 |

## 处置决策: 方案 (b) 删除, 并扩展到同对象全部死字段

- (a) 接线被否: workspace 清理硬编码四区域运行良好, 白名单会引入第二真源 (R-274 捕获误导即为其危害实例); retention/monthly 接线属"为死配置补功能", 无人提出需求, YAGNI——若未来真要可配置, 应随消费方一起加回。
- (b) 删除范围: ArtifactConfig 接口与 DEFAULT_ARTIFACT_CONFIG 中移除 4 个死字段, 保留 generate_md_views 与 mergeArtifactConfig/readArtifactConfig 链路。
- 迁移面: init 不写 artifacts 块 (init.ts 无 artifacts 输出), 模板无引用; 用户 config.json 中若残留这些字段, mergeArtifactConfig 展开后无读取方, 删除前后行为完全一致——迁移注释写入类型定义处即可。
- 文档漂移同修 (common-mistake 规则): docs/workflows/artifact-policy.md 只保留 generate_md_views, 删除 4 个死字段的表述与示例; "按需渲染" 一节改为陈述 render 命令恒可用, 不再暗示由 generate_on_demand 控制。

## 收敛后的需求

- FR-1: 删除 ArtifactConfig 与 DEFAULT_ARTIFACT_CONFIG 中的 keep_workspace_views、generate_on_demand、archive_decisions_monthly、decisions_retention_days; 保留 generate_md_views; 在类型定义处留迁移注释 (删除原因 + 残留用户配置无影响)。
- FR-2: docs/workflows/artifact-policy.md 同步——配置结构/示例只含 generate_md_views, 修正按需渲染一节; 不再出现 30 天等与实际行为矛盾的数字。
- AC: 全仓 grep 四个字段名仅命中迁移注释与 backlog/归档历史; pnpm test 全绿 (generate_md_views 行为回归不变)。

## 范围外

- decisions 老化参数 (14 天) 的可配置化: 如有真实需求另立条目, 随消费方一起实现。
- config.yaml/config.json 双真源整併 (architecture.md 已有 gotcha, 属独立大题)。
