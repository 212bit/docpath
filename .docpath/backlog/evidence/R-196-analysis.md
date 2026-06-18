# R-196 分析：Fix command inference when check/review fails

## 1. 目标与背景

**问题**：`docpath check`/`review` 失败时，`transitionWorkflow` 把错误信息写入 `state.current_step`
（如 `质量检查失败: 子任务完成度 (0/4)`、`审查失败: 2 错误, 1 警告`），导致后续 `docpath step done`
若不传 `--step` 无法从 `current_step` 推断当前步骤，影响工作流连续性。

**代码位置**：
- `src/commands/check.ts:1122-1125` — `check.failed` 写 `质量检查失败: ...`
- `src/commands/review.ts:316` — `review.failed` 写 `审查失败: ...`

## 2. 现状实测（2026-06-17）

构造 check 失败 + `current_step` 被污染的场景实测 `current-step-inference.ts`：

| 场景 | state.current_step | breadcrumb 最后 in_progress | 推断结果 |
|---|---|---|---|
| A: S2 已 done，check 失败 | `质量检查失败: 子任务完成度 (0/4)` | S2(已done) | ✅ 推断 S2（来自 breadcrumb） |
| B: S2 仍 in_progress，check 失败 | 污染值 | S2(in_progress) | ✅ 推断 S2（来自 breadcrumb） |

**结论**：R-196 描述的核心 bug（"step done 无法推断"）**已被 `current-step-inference.ts` 修复**——
`isValidStepId` 正则 `/^[A-Za-z][A-Za-z0-9_-]*$/` 过滤掉含中文/空格/冒号的错误信息，
且 `resolveCurrentStep` 优先用 breadcrumb 的 `in_progress` 步骤。

## 3. 残余问题（本任务范围）

### 问题 1：check/review 失败仍污染 state.current_step
`check.ts:1123` 和 `review.ts:316` 在失败分支仍把错误信息写入 `current_step`。
虽不致命（推断靠 breadcrumb），但破坏状态卫生：`state.json` 里 `current_step`
长期残留错误信息，误导 `status`/`next` 的展示。

### 问题 2：推断日志误导性显示污染值
`step.ts:81` 打印 `推断依据: state.current_step = 质量检查失败: ...`，但实际推断
用的是 breadcrumb。展示污染值为"依据"会误导调试。

### 问题 3：current-step-inference.ts 零专项测试
`resolveCurrentStep` 的污染过滤、breadcrumb 优先、不一致处理逻辑无专项测试，
仅 next/agent-lifecycle 间接覆盖。回归风险高（与 --draft 同类"零覆盖"问题）。

## 4. 推荐方案

- **方向①（breadcrumb 推断）保留**：已实现且实测稳健，是第一道防线。
- **方向②（不污染 current_step）补做**：check/review 失败时不覆盖 `current_step`，
  改写一个稳定的诊断字段（如保留原 current_step，错误信息进 breadcrumb context）。
- **补专项测试**：覆盖污染过滤、breadcrumb 优先、plan 验证、不一致处理。
- **修日志**：推断来源是 breadcrumb 时，依据展示 breadcrumb 而非污染的 current_step。

## 5. 范围边界

**包含**：check.ts/review.ts 失败分支 current_step 写入、step.ts 推断日志、
current-step-inference.ts 专项测试。

**不做**：不改 `resolveCurrentStep` 的推断算法本身（已稳健）；不改 check/review 的
成功分支；不重构 transitionWorkflow 的 currentStep 参数机制。
