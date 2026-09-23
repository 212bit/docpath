# T-20260923-backlog-id-evidence-capture - 高优先级架构优化包：backlog 写路径解耦、id/归档原子化、动作单真源、evidence 存在校验、capture 期去重

> backlog_id: R-355
> backlog_source: docpath backlog add

## 1. 背景与动机

架构评审（会话内基于真实代码取证）识别出 6 个高优先级优化点：1) writeBacklogItem 每次写触发 refreshBacklogIndex 全目录扫描+归档副作用（写放大，O(active+archived)/次）；2) nextBacklogId 依赖本 checkout+主 checkout 共 4 个目录的文件名扫描取 max，跨 checkout 分配无原子性（自认缺口，历史 5 起撞号 R-321/322）；3) 动作名单在 register 描述、无 action 报错、default 报错 ≥3 处硬编码（本次加 archive 实测逐一同步）+ 命令层单文件约1300行混杂校验/编排/渲染/输出；4) promote 成熟度门禁只查 evidence 字段非空、不查引用文件真实存在（悬空引用可满足门禁，readiness 信号失真）；5) 归档 existsSync+rename 存在 TOCTOU 窗口且撞号静默跳过需事后 groom 暴露（同族竞态 R-296）；6) 重复登记在产生时无拦截（3 例实测），去重只在 promote 提示。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-355-requirements.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 高优先级架构优化包：backlog 写路径解耦、id/归档原子化、动作单真源、evidence 存在校验、capture 期去重
  - 来源 backlog: R-355

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 高优先级架构优化包：backlog 写路径解耦、id/归档原子化、动作单真源、evidence 存在校验、capture 期去重

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
- 当前问题: 架构评审（会话内基于真实代码取证）识别出 6 个高优先级优化点：1) writeBacklogItem 每次写触发 refreshBacklogIndex 全目录扫描+归档副作用（写放大，O(active+archived)/次）；2) nextBacklogId 依赖本 checkout+主 checkout 共 4 个目录的文件名扫描取 max，跨 checkout 分配无原子性（自认缺口，历史 5 起撞号 R-321/322）；3) 动作名单在 register 描述、无 action 报错、default 报错 ≥3 处硬编码（本次加 archive 实测逐一同步）+ 命令层单文件约1300行混杂校验/编排/渲染/输出；4) promote 成熟度门禁只查 evidence 字段非空、不查引用文件真实存在（悬空引用可满足门禁，readiness 信号失真）；5) 归档 existsSync+rename 存在 TOCTOU 窗口且撞号静默跳过需事后 groom 暴露（同族竞态 R-296）；6) 重复登记在产生时无拦截（3 例实测），去重只在 promote 提示。
- 目标: 高优先级架构优化包：backlog 写路径解耦、id/归档原子化、动作单真源、evidence 存在校验、capture 期去重
- 背景: 来自 backlog R-355，Decision Brief 证据: .docpath/backlog/analysis/R-355-decision-brief.md
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 会话原话：同意，按照高优先级推进（评审 6 点全量）

### 已有 Decision Brief (来自 backlog evidence)

.docpath/backlog/analysis/R-355-decision-brief.md

## 5. 验收标准

- [ ] AC-1: 1) 单条写入成本与 backlog 目录总量无关（写入不隐式触发全量索引重建/归档；索引与归档显式或惰性）；2) id 分配为单一权威源上的原子操作，跨 checkout/并发会话无撞号窗口，成本 O(1)；3) 动作清单单一真源，帮助/校验/报错派生，扩展动作只改一处；命令层按校验/编排/渲染/输出拆分，单文件职责单一；4) evidence 引用必须解析到真实文件，否则 promote 门禁拒绝；5) 归档为原子操作，冲突发生时报错留痕，不依赖事后扫描；6) capture/add 入口即对本 checkout+主 checkout 的 active/archived 做同 id/同标题去重提示，重复在产生时可见。全量测试通过 + docpath check 过门禁。非目标：worktree backlog 快照过期根治（另立项）；同义不同名语义级判重。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-355 与任务 T-20260923-backlog-id-evidence-capture 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
