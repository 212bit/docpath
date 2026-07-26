# T-20260726-breadcrumb-trace - 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档

> backlog_id: R-302
> backlog_source: docpath backlog add

## 1. 背景与动机

二次 review P1-b：运行时工件增长治理不一。勘察修正：trace 有截断但为丢弃式（2000→1000 行，历史直接支撑过 R-299 证据决策，丢弃可惜）；全局 breadcrumb 的 truncateBreadcrumb 机制（200 条窗口、持锁、连带渲染 md）自建成起零调用方——纯死机制，全局 jsonl 已 132KB。decisions 月轮转是良好先例。

1. journal 接线 truncateBreadcrumb（任务收口为天然裁剪点；任务级 canonical breadcrumb 保存完整历史，全局仅工作窗口，裁剪整体无损）。
2. trace 截断改零丢失轮转：裁掉条目归档 trace-YYYY-MM.jsonl（decisions 月轮转同款模式）。
3. 其余 workspace 小工件核查：check-history/debug/compact-context 均为定长覆盖写，无需治理。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
  - 来源 backlog: R-302

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档

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
- 当前问题: 二次 review P1-b：运行时工件增长治理不一。勘察修正：trace 有截断但为丢弃式（2000→1000 行，历史直接支撑过 R-299 证据决策，丢弃可惜）；全局 breadcrumb 的 truncateBreadcrumb 机制（200 条窗口、持锁、连带渲染 md）自建成起零调用方——纯死机制，全局 jsonl 已 132KB。decisions 月轮转是良好先例。
- 目标: 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
- 背景: 来自 backlog R-302
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: journal 后全局 breadcrumb ≤200 条且输出裁剪报告；任务级 canonical 不受影响。
- [ ] AC-2: trace 超窗后旧条目落月归档文件，主文件截回窗口，零丢弃。
- [ ] AC-3: 全量套件绿。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-302 与任务 T-20260726-breadcrumb-trace 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
