# T-20260715-memory-indexing-docpath-reveal - Memory Indexing: docpath reveal 升级为内容检索

> backlog_id: R-257
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 decisions.jsonl 和 journal 只有文件存储，跨 session 查决策只能全文 grep。在 journal 写入时自动建立倒排关键词索引，让 docpath reveal --topic <keyword> 支持内容匹配而非仅文件名匹配。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Memory Indexing: docpath reveal 升级为内容检索
  - 来源 backlog: R-257

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Memory Indexing: docpath reveal 升级为内容检索

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

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
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: Memory Indexing: docpath reveal 升级为内容检索
- 背景: 来自 backlog R-257
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: `docpath docs scan` 为 Markdown 文档建立 compact 内容词索引，使正文关键词可被 topic 查询命中。
- [ ] AC-2: `docpath reveal --topic <keyword>` 能命中正文中出现、但 path/title/summary 均未出现的关键词。
- [ ] AC-3: `docpath context --topic <keyword>` 复用同一索引匹配语义，不回退到运行时全文 grep。
- [ ] AC-4: 索引仍保持 compact：不写入全文正文，默认不输出 `topic_tags`，归档正文展开策略保持不变。
- [ ] AC-5: 现有 topic synonym 行为保持不变。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-257 与任务 T-20260715-memory-indexing-docpath-reveal 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
