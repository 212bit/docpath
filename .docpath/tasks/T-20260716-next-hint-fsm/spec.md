# T-20260716-next-hint-fsm - next_hint 应从 FSM 合法转移单源派生,禁止各命令手写路由提示

> backlog_id: R-269
> backlog_source: docpath backlog capture

## 1. 背景与动机

`next_hint` 与命令正文推荐多源手写，与 `transitions.ts` 的 FSM 合法转移脱节。现场症状：

1. `check` 正文说下一步 review，尾部 `next_hint` 却推荐 `plan`（plan 已存在且步骤全完成）。
2. 恢复提示推荐非法 `recover`。
3. project intake 手写 next_hint 与主路由并行。

已有证据：`.docpath/backlog/analysis/R-269-analysis.md`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 导出 FSM 派生的工作流建议命令接口（基于 `listValidWorkflowEvents` / event→command 映射），作为 gate 类路由的合法命令真源
- [ ] FR-2: `inferNextAction` 在推荐 gate 类命令（check/review/journal/recover/done 等）时，校验其与当前 phase/gate 合法；非法则回退合法 FSM 建议或 `docpath next --agent`
- [ ] FR-3: 生命周期命令的 machine `next_hint` 继续统一经 `emitNextHint` / agent router；禁止同输出路径出现可分叉的第二套 gate 命令字符串
- [ ] FR-4: project intake 的 next_hint 统一走既有 `nextActionForIntake` 单源，仅推荐已支持的 project/backlog 命令

### 非功能需求
- [ ] NFR-1: 不改变 FSM phase/gate 合法矩阵本身
- [ ] NFR-2: 不重写 backlog/learn/git closeout 优先级阶梯（仅约束 gate 命令族）
- [ ] NFR-3: 自动化测试覆盖关键路径

## 3. 范围界定

### 包含
- FSM 建议命令导出与 gate 路由约束
- check 通过后 next_hint 稳定性
- 非法恢复提示约束
- project intake next_hint 单源化（若仍有重复字符串）
- 相关测试

### 不包含
- 用纯 FSM 替换整个 `inferNextAction`
- 改变 project-intake 与 task FSM 的边界
- R-270/R-271/R-272 范围

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 实现深度 | A 局部修 / B FSM 约束 gate 路由 / C 全 FSM 替换 router | B | 根治多源脱节，保留 backlog 语义 |
| 2 | 约束范围 | 全部 recommended_command / 仅 gate 族 | 仅 gate 族 | 避免误伤 backlog/learn/closeout |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: next_hint 多源手写与 FSM 合法转移脱节
- 目标: gate 类 next_hint 由 FSM 候选约束 + agent router 单源派生
- 背景: R-267 S8 与 project-brief next_hint 同族问题；分析见 R-269-analysis
- 可选方案:
  - 方案 A: 仅修 check→plan 错路由
  - 方案 B: 导出 FSM 候选并约束 gate 类 recommended_command
  - 方案 C: 完全用 FSM 替换 inferNextAction
- 推荐方案: 方案 B
- 决策理由: 在不丢失 backlog/git 语义的前提下堵住多源分叉
- 不做什么: 不重写 backlog 优先级；不把 project-intake 并入 task FSM
- 成本: 中
- 风险: 过度约束；通过仅约束 gate 命令族缓解
- 回滚方案: 回滚本任务提交
- 用户确认: 目标「完成剩余所有 backlog」下按方案 B 推进（confirmed by goal）

## 5. 验收标准

- [ ] AC-1: check 通过且 gate=check_pass 时，next_hint 推荐 `docpath review`（或 profile 等价路径），不在 plan 已存在且步骤全完成时推荐 `docpath plan`
- [ ] AC-2: 非法转移恢复提示仅推荐当前 phase/gate 合法命令或 `docpath next --agent`
- [ ] AC-3: 生命周期命令的 machine next_hint 统一经 emitNextHint / agent router
- [ ] AC-4: 自动化测试覆盖 check→review、blocked-only recover、FSM 约束
- [ ] AC-5: project intake next_hint 仅推荐已支持命令
- [ ] AC-6: backlog R-269 与任务 T-20260716-next-hint-fsm 双向关联保持

