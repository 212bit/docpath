# T-20260929-docs - 文档关联图谱：docs网状关联与孤岛治理

> backlog_id: R-439
> backlog_source: docpath start

## 1. 背景与动机

- 文档关联图谱：docs网状关联与孤岛治理

## 2. 需求清单

### 功能需求
- [ ] FR-1: docs网状关联
  - 来源 backlog: R-439
- [ ] FR-2: 孤岛治理

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- `docs/**/*.md` frontmatter `related` 解析与 `docs-index.json` related/backlinks 聚合（version 2）
- `docpath docs graph` 子命令：报告 / `--fix` 半自动补链 / `--mermaid` 全景图
- `docs lint` 孤岛检测规则；`docs/README.md` docpath:block 机器索引区重建

### 不包含
- `.docpath/` 资产与任务工件入图
- `reveal`/`context` 关联文档自动注入（二期）
- 弱关联（单向单链）告警（二期）
- LLM 语义推荐

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 关联语义 | A 显式 / B 纯自动 / C 混合 | **C 混合**：显式 related 为主干，本地算法推荐候选、人确认落盘 | 纯自动噪音不可控，纯人工无人维护 |
| 3 | 组织模型 | A 反孤立 / B 反目录 | **A 反孤立**：目录保留粗分类，治理孤岛 | 与 project-document-placement.md 规范一致 |
| 4 | 作用范围 | A 仅 docs/ / B 含 .docpath | **A 仅 docs/** | 任务工件有 task_id 天然分组，图化只产噪声 |
| 5 | 交互模式 | A 报告 / B 全自动 / C 报告+fix | **C**：`docs graph` 报告 + `--fix` 半自动 | 对齐现有 docs lint/fix 风格 |
| 6 | 存储格式 | A frontmatter / B 集中图文件 | **A** frontmatter 单向声明，索引聚合反推 backlink | 零冗余不漂移，文档自带关联 |
| 7 | 孤立判定 | A 严格 / B 宽松 | **B**：无出链且无入链才算孤立 | 24 篇体量下避免 warning 噪声 |
| 8 | 推荐引擎 | A 本地算法 / B LLM | **A**：content_terms/topic_tags 交集相似度 | 零依赖、离线、可复现 |
| 9 | README 接管 | A 接管 / B 不动 / C 只报告 | **A**：docpath:block 机器区可重建，手工区保留 | 手工索引漂移正是本次要治的病 |
| 10 | 可视化 | A mermaid / B 无 | **A**：`--mermaid` 全景图 | 成本极低，可感知价值高 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
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
- 当前问题: docs/ 存在孤岛文档，无任何文档间关联机制；docs/README.md 手工索引漂移
- 目标: frontmatter related 显式声明 + 索引层 backlink 反推 + 本地推荐 + 半自动 fix，消除孤岛
- 背景: 2026-09-29 grilling 会话九项决策定案，完整设计见 `.docpath/tasks/current/wip-note.md`
- 可选方案:
  - 方案 A: 混合关联（显式 + 本地推荐 + 半自动 fix）— 已采纳
  - 方案 B: 纯自动主题关联（否决：噪音不可控）
  - 方案 C: 集中式 graph 文件存储（否决：第二真源、与索引扫描架构相逆）
- 推荐方案: 方案 A
- 决策理由: 零冗余防漂移、零 LLM 依赖、对齐现有 lint/fix 模式
- 不做什么: 不动 .docpath/ 资产与任务工件；不做 context 自动注入（二期）；不 nag 弱关联；不反写对方文件
- 成本: 中等（约 300+ 行 + 定向测试）
- 风险: frontmatter 解析需容错无头文档；index version 升级需保持旧消费方兼容
- 回滚方案: 回滚本任务提交；docs-index.json 由扫描器重建，无手工真源损失
- 用户确认: 已确认（2026-09-29 会话中逐项批准方案）

## 5. 验收标准

- [ ] AC-1: docs网状关联 满足功能要求并通过测试
- [ ] AC-2: 孤岛治理 满足功能要求并通过测试
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-439 与任务 T-20260929-docs 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
