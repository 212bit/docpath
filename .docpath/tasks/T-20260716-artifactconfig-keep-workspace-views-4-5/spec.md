# T-20260716-artifactconfig-keep-workspace-views-4-5 - ArtifactConfig 死字段清理: keep_workspace_views 等 4/5 字段无消费方, 删除并同修文档

> backlog_id: R-275
> backlog_source: docpath backlog capture

## 1. 背景与动机

2026-07-16 代码核验 (analysis: .docpath/backlog/analysis/R-275-analysis.md):
原捕获聚焦 keep_workspace_views, 逐字段核验后确认 ArtifactConfig 5 字段中 4 个死:
keep_workspace_views (零消费, workspace-cleanup.ts 硬编码四区域从不按白名单扫)、
generate_on_demand (render 命令恒可用, 从不读开关)、archive_decisions_monthly
(gcDecisions 无条件按月归档)、decisions_retention_days (文档写 30 天, 实际
gcDecisions 默认 14, 配置从未被读——死且误导)。仅 generate_md_views 有真实消费方
(structured-docs.ts:687)。死配置危害已发生: R-274 捕获即基于 keep_workspace_views
误删前提。处置: 方案 (b) 删除 4 个死字段 (接线=为死配置补功能, YAGNI; 白名单引入
第二真源), 同修 docs/workflows/artifact-policy.md 文档漂移。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-275-analysis.md

## 2. 需求清单

### 功能需求
- [x] FR-1: 删除 ArtifactConfig 与 DEFAULT_ARTIFACT_CONFIG 中 keep_workspace_views、generate_on_demand、archive_decisions_monthly、decisions_retention_days; 保留 generate_md_views 与 mergeArtifactConfig/readArtifactConfig 链路; 类型定义处留迁移注释 (残留用户配置无行为影响)。
  - 来源 backlog: R-275
- [x] FR-2: 文档漂移同修——docs/workflows/artifact-policy.md 配置结构/示例只含 generate_md_views 并附迁移注释; gc-decisions CLI 帮助文案 "默认 30" 修正为实际默认 14 (register/backlog-maintenance.ts)。

### 非功能需求
- [x] NFR-1: 保持与现有 DocPath 工作流兼容 (generate_md_views 行为不变, 全量测试回归)

## 3. 范围界定

### 包含
- src/types/config.ts: ArtifactConfig 接口 + DEFAULT_ARTIFACT_CONFIG 死字段删除与迁移注释
- docs/workflows/artifact-policy.md 与 gc-decisions 帮助文案的漂移修正
- tests/artifact-config.test.mjs: 契约回归 (默认只含 generate_md_views; 残留旧字段惰性)

### 不包含
- decisions 老化 14 天参数的可配置化 (如有真实需求随消费方另立)
- config.yaml/config.json 双真源整併 (architecture rules 已有 gotcha, 独立大题)

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 死配置处置 | (a) 接线 / (b) 删除 | (b) 删除 | 清理路径硬编码运行良好; 白名单引入第二真源; 接线=为死配置补功能, YAGNI |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ArtifactConfig 5 字段中 4 个定义后从未被读取, 其中 decisions_retention_days 文档值 (30) 还与实际行为 (14) 矛盾; 死配置已实际误导过一次需求捕获 (R-274)。
- 目标: 配置面只保留有真实消费方的字段, 文档与代码行为一致。
- 可选方案:
  - 方案 A (=backlog 方案 b): 删除 4 个死字段 + 迁移注释 + 文档同修
  - 方案 B (=backlog 方案 a): 为死字段接线实现功能 (白名单清理/retention 可配置化)
- 推荐方案: 方案 A
- 决策理由: 满足 backlog 声明的全部验收条件且无额外依赖风险; 接线属为死配置补功能 (YAGNI), 白名单引入第二真源; 删除后行为零变化 (字段本就无人读)。
- 不做什么: 不动 generate_md_views 及其消费链; 不做 retention 可配置化; 不整併 config 双真源。
- 成本: 低——纯删除 + 文档修正, 契约测试固定迁移语义。
- 风险: 用户 config.json 残留旧字段——已核验为惰性 (merge 后无读取方), 迁移注释说明可安全移除。
- 回滚方案: 回滚本任务提交即恢复原类型定义与文档。
- 用户确认: 用户于 2026-07-16 本会话明确指示"继续做 R-275"; 方案 (b) 删除处置在 backlog 捕获时即已记录并经分析核验收敛, 删除范围扩展至同对象全部死字段已落 analysis 与 backlog 正文。
- 变更类型说明: 仅勾"API / 数据契约"——config.json artifacts 配置面收缩; promote 脚手架预勾的"架构/模块边界""工作流/Agent 行为"与实际不符 (零行为变更), 已取消。

## 5. 验收标准

- [x] AC-1: 全仓 grep 四个死字段名仅命中迁移注释 (src/types/config.ts, artifact-policy.md)、契约测试 legacy fixture (tests/artifact-config.test.mjs) 与 backlog/归档历史。
- [x] AC-2: pnpm test 全绿 (637/637, 含 3 条新契约用例); generate_md_views 行为回归不变。
- [x] AC-3: artifact-policy.md 不再文档化任何无消费方字段。
- [x] AC-4: 生成的 spec 可直接进入 `docpath plan` (已执行, plan S1-S3 全部完成)。
- [x] AC-5: backlog 条目 R-275 与任务 T-20260716-artifactconfig-keep-workspace-views-4-5 建立双向关联 (links.task/links.spec + backlog_id 头)。

---

*此文件由 `docpath backlog promote` 生成。*
