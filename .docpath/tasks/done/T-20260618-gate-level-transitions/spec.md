# T-20260618-gate-level-transitions - 状态机正确性:gate 级前置 + 清理死的 LEVEL_TRANSITIONS

> backlog_id: R-203
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

两套状态机:规约 FSM (state-machine.ts LEVEL_TRANSITIONS) 零消费=死代码;运行时 FSM (transitions.ts EVENT_TARGETS) 是唯一强制层。缺口:gate 级前置未在 FSM 层强制(check_fail 仍可进 review),且 level 被运行时忽略。

## 验收

EVENT_TARGETS 支持 requiredGate 可选字段并在 transitionWorkflow 持锁段强制;新增负向测试(check_fail 下 review.passed 被拒)与正向测试通过;死代码 LEVEL_TRANSITIONS 按确认方案处置;pnpm test 全绿 + docpath check 通过

## 2. 需求清单

### 功能需求
- [ ] FR-1: 状态机正确性:gate 级前置 + 清理死的 LEVEL_TRANSITIONS
  - 来源 backlog: R-203

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 状态机正确性:gate 级前置 + 清理死的 LEVEL_TRANSITIONS

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
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [x] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: 运行时只强制 transitions.ts 一套 FSM。(1) 门禁前置只到 phase 粒度,gate 级前置(check 必须 pass 才能 review)未在 FSM 层强制,仅靠 review.ts 命令层自觉;(2) state-machine.ts 的 LEVEL_TRANSITIONS/canTransition/getValidTransitions 零消费=死代码,误导读代码的人和 Agent。
- 目标: 把 gate 级前置补进 FSM 层做纵深防御;删除死转移代码,让运行时成为唯一真相源。
- 背景: 全仓 grep 确认规约 FSM 在定义文件外零消费;CLAUDE.md 声称 state transition legality 是 CLI 拥有的机械检查,但对门禁前置实际不成立。
- 可选方案: 死代码处置三选一(删除 / 标 @deprecated / 反向接线);level 分流(本任务做 / 拆独立 backlog)。
- 推荐方案: requiredGate 可选字段 + 持锁段强制(向后兼容,不动命令层契约);删除死转移代码;level 分流拆 R-204。
- 不做什么: 不在本任务处理 level 被运行时忽略(L0/quick 门禁分流),已拆为 R-204;保留 ComplexityLevel/LEVEL_NAMES/LEVEL_DESCRIPTIONS。
- 成本: 改动集中在 transitions.ts + state-machine.ts 两文件 + 测试,性能无影响,无 state.json 迁移成本。
- 风险: 收紧前置可能误拒历史漂移状态;缓解:requiredGate 覆盖合法重入来源(review_pass/review_fail),并跑全量测试 + 真实 dogfood 验证。
- 回滚方案: requiredGate 为可选字段,git revert 单次提交即可恢复;删除的死代码可从 git 历史还原。
- 用户确认: 已确认(2026-06-18)。死代码处置=删除死转移代码;level 分流=拆成独立 backlog(R-204)。经 AskUserQuestion 两项决策明确选定。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-203 与任务 T-20260618-gate-level-transitions 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
