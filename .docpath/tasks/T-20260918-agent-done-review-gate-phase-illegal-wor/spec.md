# T-20260918-agent-done-review-gate-phase-illegal-wor - agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition

> backlog_id: R-349
> backlog_source: docpath backlog add

## 1. 背景与动机

# Bug: `agent done` 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition

`docpath agent done` 在收尾时会依次走 check 门禁与 review 门禁。当 review 门禁的
失败/跳过路径要写入 review 类事件（`review.failed` / `review.skipped`），而当前
workflow 状态不满足这些事件的 FSM 前置约束（`requiredGate` / `from`）时，命令会抛出

```
❌ 未预期的错误
   [docpath] Illegal workflow transition: review.failed cannot run with gate=check_fail
   （允许门禁: check_pass, review_pass, review_fail；建议下一步: docpath check）
```

用户看到的是"未预期错误 + 非法转换"，而非"检查未通过，不能这样收口"的可操作诊断；
任务被卡在无法 closeout 的状态，错误信息还会掩盖 review 自身的失败原因（语言级审查
未通过 / skill 证据缺失等）。

**根因校正（与初版描述不同）**：`--skip-check` **不会**把 gate 置为 `check_fail`。
它只写审计决策日志、不产生任何状态转换（`src/commands/agent.ts:370-378` →
`src/engine/policy.ts:45-56`，git 历史各版本同形）。真实触发条件是
**`agent done` 执行时 gate 仍不是 `check_pass`**（`none` / `check_fail`），此时 review 类事件
的 `requiredGate`（`transitions.ts:88-90` = `check_pass` / `review_pass` / `review_fail`）
不满足。`--skip-check` 只是用户在这种状态下习惯性追加的旗标，与成因无因果关系。

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | `--skip-check` 只记审计，不转换状态 | agent.ts:370-378；policy.ts:45-56（仅 `appendDecision('policy.skip')`） |
| F2 | review 事件受 requiredGate 约束，FSM 层 fail-loud 拒绝 | transitions.ts:88-90 声明；:279-286 执行 |
| F3 | `agent done` 失败路径无条件尝试这些事件 | agent.ts:469-471（review 抛错→review.failed）、:430-443（quick/instant→review.skipped）、:488-490（blocked→review.failed） |
| F4 | 无 diff 时 review 提前返回不转移，于是改为在 journal 门禁干净失败 | review.ts:469-473；journal.ts:293-295；policy.ts:30 |
| F5 | "check_fail 不得归档"是刻意契约，不是缺陷 | transitions.ts:92 注释；policy.ts:30-37 allowedCompletionGates |

| 用例 | 初始态 | 命令 | 结果 |
| --- | --- | --- | --- |
| A | phase=checking gate=check_fail（有 diff） | `agent done --step S7 --skip-check --note repro` | ❌ `review.failed cannot run with gate=check_fail`，exit 1，状态卡住 |
| B | 同 A | 追加 `--skip-review` | ✅ 干净失败 `归档门禁未通过 - gate 为 check_fail，不能完成任务` |
| C | gate=check_pass | `agent done --status blocked --skip-check --skip-review` | ⚠️ exit **0** 静默成功，state 变 `phase=reviewing gate=review_fail`（blocked 语义被污染） |
| D | profile=quick gate=check_fail | `agent done --skip-check --note x` | ❌ `review.skipped cannot run with gate=check_fail` |
| E | profile=quick phase=executing gate=none（真实 quick 流） | 同上 | ❌ `review.skipped cannot run from phase=executing`（比 A 更常见的入口） |

1. review / blocked 失败路径改为 **FSM 感知**：写入事件前判定 `listValidWorkflowEvents`，
   不合法时不尝试转换，直接以可操作文案 fail-loud（示例：`检查未通过（gate=check_fail），
   不能以 --skip-check 收口；请先 docpath check 修复（--skip-tests/--skip-lint 可减负）`），
   且保留原始失败语义，不再抛二次异常。
2. `agent done --status blocked` 与 `review.failed` 解耦，落**可达的 blocked 语义**
   （新增转换目标 gate=blocked，并让 state 渲染为 blocked 而非 check_fail）。
3. 保持门禁强度不变：不给"检查已失败仍可完成"开口子（`check_fail` 依旧不可归档）。

- 任何在 gate=`check_fail`（检查曾失败）或 phase=executing（quick 任务未跑 check）状态下
  执行 `agent done` 的任务都会被卡住，且错误信息误导。
- `--status blocked` 会把任务静默写成"审查失败"（exit 0），污染后续 next/review 路由。

环境性 check 失败（工具链缺失/Docker 不可用，check/evidence.ts:78-87 只做诊断不放行）
没有任何 sanctioned 出口，是"手工 commit 绕过 closeout"的真实痛点。是否引入
`check_skipped` 通道或让环境性失败不计入 gate，属门禁契约变更，需用户单独裁定，
不在本条目内实施。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-349-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition
  - 来源 backlog: R-349

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition

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
- 当前问题: `docpath agent done` 在收尾时会依次走 check 门禁与 review 门禁。当 review 门禁的
- 目标: agent done 失败路径硬走 review 事件，gate/phase 不合法时抛 Illegal workflow transition
- 背景: 来自 backlog R-349
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

- [ ] AC-1: gate ∈ {none, check_fail} × {standard + `--skip-check`、quick + `--skip-check`、
- [ ] AC-2: `--status blocked`} 执行 `agent done`，输出中不出现 `Illegal workflow transition` /
- [ ] AC-3: `未预期的错误`，exit≠0 且给出明确的恢复命令。
- [ ] AC-4: `--status blocked` 不再产生 `gate=review_fail` / `phase=reviewing`，而是写入
- [ ] AC-5: 可达的 blocked 状态（且 `docpath status` 能正确渲染）。
- [ ] AC-6: 新增/修改的转换规则有单测覆盖（`tests/` 现对 `agent done --status blocked` 零覆盖）；
- [ ] AC-7: 既有正常路径（gate=check_pass 全量 done、quick 经 check 后收口）不回归。
- [ ] AC-8: `check_fail` 仍被拒绝归档（F5 契约不回退）。
- [ ] AC-9: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-10: backlog 条目 R-349 与任务 T-20260918-agent-done-review-gate-phase-illegal-wor 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
