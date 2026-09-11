# T-20260907-project-intake-learn-lesson-summary-conf - 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属

> backlog_id: R-316
> backlog_source: docpath backlog capture

## 1. 背景与动机

trace 1460 条记录中零命中的三个**大块/有耦合**命令。与 R-315（无耦合零使用命令）分开立项，因为每一项都需要先做耦合勘察或产品裁决，不能裸删。

### 1. `project` intake 工作流（816 LOC，0 次调用）

`docpath project capture | analyze | brief | settle | backlog | status` 是一套完整的"新项目需求沉淀"工作流，AGENTS.md 中用整整一节描述它，并要求"开发前最小冻结标准包为 requirements.md + architecture.md"。

现实：全周期 0 次调用。本仓库自己的 257 个完成任务走的都是 `backlog promote` → spec → plan 主路径，从未启用 project intake。

这是一条**平行工作流**，与主路径功能重叠。要么删，要么回答"它相对 backlog promote 路径的独特价值是什么"。保留不用的平行工作流本身就是认知负担。

### 2. `learn`（547 LOC，1 次调用）

有真实耦合，不能单独删：
- `src/utils/agent-output/formatters.ts:891` 读取 `workspace/lesson-candidates.md`
- `formatters.ts:91` 在 `--agent` 载荷中输出 `lesson_summary.pending_count`
- `formatters.ts:362` 存在 `learnRequired` 判定，且 `next --agent` 会据此推荐 `docpath learn --dry-run`

即 `learn` 是 `lesson-candidates.md` 的**唯一写入方**，而 `next` 是**读取方**。删除 learn 必须同时摘除 formatters 的 lesson_summary 路由，否则 `next` 会持续推荐一个不存在的命令（R-261 曾经修过同类"推荐空转"问题）。

另有 `lesson-candidates.md` 已积累 31089 字节，说明数据侧在产出，只是没人消费。

### 3. `config`（264 LOC，0 次调用）

命令层零使用，配置实际通过直接读写 `.docpath/config.yaml` 完成（R-297 已把配置读取收敛到 `readDocPathConfig` 单一出口）。需判断：命令层是否是人类入口（若是则按 R-315 的采样盲区原则保留），还是纯冗余。

本条目标记为需先分析再行动，不直接进入 promote。

- [ ] 裁决 `project` intake：删除平行工作流，或明确其相对 `backlog promote` 的不可替代价值并给出启用计划
- [ ] 若删 `learn`：`formatters.ts` 的 `lesson_summary` 路由与 `learnRequired` 一并摘除，`next --agent` 不再推荐；`lesson-candidates.md` 的产出链路同步处置
- [ ] 判定 `config` 命令归属：人类入口（保留）还是 Agent 面冗余（删）
- [ ] 三项各自独立成子任务，互不阻塞

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-316-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
  - 来源 backlog: R-316

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属

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
- 当前问题: trace 1460 条记录中零命中的三个**大块/有耦合**命令。与 R-315（无耦合零使用命令）分开立项，因为每一项都需要先做耦合勘察或产品裁决，不能裸删。
- 目标: 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属
- 背景: 来自 backlog R-316，Decision Brief 证据: ADR-20260908-001: 移除 project/learn/config 冗余命令与耦合
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户明确确认下线 project intake/learn/config 模块

### 已有 Decision Brief (来自 backlog evidence)

ADR-20260908-001: 移除 project/learn/config 冗余命令与耦合

## 5. 验收标准

- [ ] AC-1: [ ] 每项裁决结论与依据记录于本条目的 analysis 证据中
- [ ] AC-2: [ ] 删除项六维全链清理 + fail-loud 防复辟断言
- [ ] AC-3: [ ] 保留项说明理由并写入 rules，避免下次重复评估
- [ ] AC-4: [ ] 全量测试与 typecheck 通过
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-316 与任务 T-20260907-project-intake-learn-lesson-summary-conf 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
