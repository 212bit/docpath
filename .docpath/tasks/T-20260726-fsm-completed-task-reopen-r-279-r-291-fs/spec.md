# T-20260726-fsm-completed-task-reopen-r-279-r-291-fs - FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)

> backlog_id: R-298
> backlog_source: docpath backlog add

## 1. 背景与动机

FSM 门禁事件 check.passed/check.failed/review.failed 的 from 数组含 'completed'，已完成任务可被门禁动作静默重入（transitions.ts:79-84）。这是 R-279（completed 上 go/agent step 半执行污染 breadcrumb）与 R-291（completed 上 plan 污染计划证据）同族事故的 FSM 层残口：命令层已逐个加守卫，但状态机本身仍宣告重入合法，tests/transitions.test.mjs:80/91 甚至固化了该行为。2026-07-26 架构 review 建议（用户已确认方向）：去掉门禁事件的 completed 来源，重入必须走显式 reopen 事件。

1. transitions.ts：check.passed/check.failed/review.failed 的 from 移除 'completed'；新增 'task.reopened' 事件（completed → executing, gate none）。task.created（新任务正常路径）与 journal.archived（幂等重归档）保留 completed 来源。
2. task.ts 新增 `docpath task reopen` 动作：仅 completed 态可用，发 task.reopened 转移 + breadcrumb 记录显式意图，提示重走 check/review/journal 闭环。
3. 重写 transitions.test.mjs 两个固化旧行为的用例：completed 上 check/review 事件 fail-loud；新增 reopen 正路径用例（reopen → executing → 门禁流转恢复）。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-286-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
  - 来源 backlog: R-298

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)

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
- 当前问题: FSM 门禁事件 check.passed/check.failed/review.failed 的 from 数组含 'completed'，已完成任务可被门禁动作静默重入（transitions.ts:79-84）。这是 R-279（completed 上 go/agent step 半执行污染 breadcrumb）与 R-291（completed 上 plan 污染计划证据）同族事故的 FSM 层残口：命令层已逐个加守卫，但状态机本身仍宣告重入合法，tests/transitions.test.mjs:80/91 甚至固化了该行为。2026-07-26 架构 review 建议（用户已确认方向）：去掉门禁事件的 completed 来源，重入必须走显式 reopen 事件。
- 目标: FSM completed 重入收紧: 门禁事件禁入完成态, 新增显式 task reopen (R-279/R-291 家族 FSM 层收口)
- 背景: 来自 backlog R-298，Decision Brief 证据: 2026-07-26 架构 review P2-10 建议(加显式 task.reopened, from 去 completed), 用户批准 review 路线并以 continue 授权; task.created/journal.archived 保留 completed 来源(新任务/幂等重归档为合法语义)
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户批准架构 review 建议路线, continue 授权按序实施

### 已有 Decision Brief (来自 backlog evidence)

2026-07-26 架构 review P2-10 建议(加显式 task.reopened, from 去 completed), 用户批准 review 路线并以 continue 授权; task.created/journal.archived 保留 completed 来源(新任务/幂等重归档为合法语义)

## 5. 验收标准

- [ ] AC-1: completed 态直发 check.passed/check.failed/review.failed 均被 FSM 拒绝（fail-loud 含建议命令）。
- [ ] AC-2: docpath task reopen 将 completed 任务转入 executing 并记录 breadcrumb；重开后 check/review/journal 全流程可走通。
- [ ] AC-3: task.created（新任务）与 journal.archived（重归档）的 completed 来源行为不变；全量套件绿。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-298 与任务 T-20260726-fsm-completed-task-reopen-r-279-r-291-fs 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
