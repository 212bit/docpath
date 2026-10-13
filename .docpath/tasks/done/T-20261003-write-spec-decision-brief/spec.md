# T-20261003-write-spec-decision-brief - write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测

> backlog_id: R-449
> backlog_source: docpath backlog add

## 1. 背景与动机

两个实测确认的静默隐患：(1) 覆盖写无反馈——write-spec 走 writeActiveTaskFile 的 writeFile 全量覆盖，实测在任务已推进到 executing 后再次写入，spec.md 被静默换掉，无提示、无备份、不校验与既有 spec 差异，而 plan 仍按旧 spec 生成，产生无感知漂移。(2) ADR 落错位置丢失机器真源——Decision Brief 仅被 structured-docs.ts:212 识别为 `## 4.1 重大变更门禁` 下的 `### Decision Brief`；R-129 第三次写入把 D1-D5 放进自定义的 `## 6. 决策简报`，实测 spec.json 的 decision_brief_markdown 为空串、decision_brief 仅剩兜底默认句。md 视图仍可见 D1-D5，但按协议 md 只是人读视图、agent 消费的是 spec.json，且 renderSpecMarkdownFromDocument 只输出 1/2/3/4/4.1/5 节，自愈重建时 `## 6.` 会整节丢弃。

## 2. 需求清单

### 功能需求
- [ ] FR-1: write-spec 覆盖写告警
  - 来源 backlog: R-449
- [ ] FR-2: 非规范 Decision Brief 位置检测

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

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
- 当前问题: 两个实测确认的静默隐患：(1) 覆盖写无反馈——write-spec 走 writeActiveTaskFile 的 writeFile 全量覆盖，实测在任务已推进到 executing 后再次写入，spec.md 被静默换掉，无提示、无备份、不校验与既有 spec 差异，而 plan 仍按旧 spec 生成，产生无感知漂移。(2) ADR 落错位置丢失机器真源——Decision Brief 仅被 structured-docs.ts:212 识别为 `## 4.1 重大变更门禁` 下的 `### Decision Brief`；R-129 第三次写入把 D1-D5 放进自定义的 `## 6. 决策简报`，实测 spec.json 的 decision_brief_markdown 为空串、decision_brief 仅剩兜底默认句。md 视图仍可见 D1-D5，但按协议 md 只是人读视图、agent 消费的是 spec.json，且 renderSpecMarkdownFromDocument 只输出 1/2/3/4/4.1/5 节，自愈重建时 `## 6.` 会整节丢弃。
- 目标: write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测
- 背景: 来自 backlog R-449
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

- [ ] AC-1: 1) 目标 spec.md 已存在且内容不同时，write-spec 打印覆盖告警（覆盖行数 / FR-AC 条目增减）并提示差异，必要时要求 --force 确认；2) 检测到 `## 6. 决策简报`/`## decision_brief` 等非规范 ADR 章节时，提示应置于 `## 4.1 重大变更门禁 > ### Decision Brief`；3) 上述两种情形各有回归测试钉住行为。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-449 与任务 T-20261003-write-spec-decision-brief 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
