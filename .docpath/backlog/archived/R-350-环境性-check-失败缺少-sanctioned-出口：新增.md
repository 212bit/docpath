---
id: R-350
title: 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道
status: done
priority: P1
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-349b-env-exempt-decision-brief.md
  spec: tasks/T-20260918-check-sanctioned-check-env-exempt/spec.md
  decision_brief: |-
    - 当前问题: `docpath check` 能正确识别工具链类失败（`environment_failure`：探针路径
    - 目标: 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道
    - 背景: 来自 backlog R-350
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
  user_confirmed: 待确认
links:
  task: T-20260918-check-sanctioned-check-env-exempt
  spec: tasks/T-20260918-check-sanctioned-check-env-exempt/spec.md
created_at: 2026-09-18
---

# 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道

## 背景

`docpath check` 能正确识别工具链类失败（`environment_failure`：探针路径
runners.ts:184-265 真跑临时目录探针；文本启发式 runners.ts:34-53 匹配
`command not found` 等），也会打印「🔧 环境诊断（这些失败看起来是工具链问题，
不是代码问题）」（check/evidence.ts:78-87）。**但它照样落 `check.failed` →
`gate=check_fail`**，而 `check_fail` 被所有收口路径拒绝：

- `docpath done` / `agent done` → `归档门禁未通过`（policy.ts:30）
- `journal.archived` 的 `requiredGate` 不含 check_fail（transitions.ts:93）
- `--skip-tests` / `--skip-lint` 只削减 runner；`check --force` 仅放行"无活跃任务"守卫
- R-349a 之后 `agent done --skip-check` 亦明确拒绝（不再崩溃）

后果：Docker/工具链不可用这类"不是代码问题"的失败会把任务卡在无法 closeout 的
状态，Agent 只能 `git commit` 手工收尾、放弃 DocPath closeout（R-349 原始报告
记录的 R-023 做法），工作流证据链断裂。

这是一个**门禁契约变更**（让"某个检查没通过"的任务可以完成），因此按 AGENTS.md
门禁 5 先固化决策简报并取得用户确认。完整边界、证据与风险分析见
`.docpath/backlog/analysis/R-349b-env-exempt-decision-brief.md`。

## 决策（用户已确认）

- 方向 A：环境失败不计入 gate，但**只对确定性可证的环境类失败**生效。
- 可豁免集 = **B3 收紧版**：探针类 ∪ 工具链语义明确的文本模式
  （`command not found`、`not recognized as an internal or external command`、
  `spawn .* ENOENT`）；
  （2026-09-18 追加收紧：`Permission denied.*node_modules` / `EACCES.*node_modules` 移出可豁免集——
   权限错误也可能是环境配置/目录所有权问题，非「工具链缺失」；仅保留在环境诊断宽集中）
  **歧义模式保持阻塞**（`Cannot find module`、`MODULE_NOT_FOUND`、
  `ENOENT.*node_modules` —— 其恢复动作是 `pnpm install` 或改代码，不是豁免）。
- 结构性保障：结构门禁（`runTaskDocumentChecks`）与 harness 规则
  （`runHarnessChecks`）不带 `environment_failure`，故混合失败天然仍是 `check_fail`。
- 落状态：新事件 `check.env_exempt`（phase=checking，gate=`check_env_exempt`）；
  下游 `review.passed/failed/skipped` 与 `journal.archived` 的 `requiredGate`
  视同 `check_pass`，评审/归档流程不改。
- 审计：写 `policy.env_exempt` 决策条目（列出被豁免项 + 原始报错首行 + 判定来源）、
  `last-check.md` 标 `⚠️ PASS (环境豁免)`、`status`/`next` 显示该 gate。
- 非粘性：每次 check 重算，下一次真实失败立即回落 `check_fail`。
- 保留反向开关 `docpath check --no-env-exempt`：默认豁免生效，该旗标强制按失败处理。

## 验收

- AC-1: 仅探针类/工具链类失败时（如 pnpm shim 不可用、`docker: command not found`），
  `docpath check` 落 `check_env_exempt`，打印豁免原因并留痕；随后 `agent done` /
  `docpath done` 能正常收口。
- AC-2: 混合失败（环境类 + 结构门禁/harness/真实编译测试失败）仍落 `check_fail`，
  收口被拒（契约不回退）。
- AC-3: 歧义模式（`Cannot find module` / `MODULE_NOT_FOUND` / `ENOENT.*node_modules`）
  不触发豁免，仍落 `check_fail`。
- AC-4: `docpath check --no-env-exempt` 下即使全是环境失败也落 `check_fail`；
  豁免态非粘性（随后一次真实失败覆盖为 check_fail）。
- AC-5: 单测覆盖上述四态，含 `check.env_exempt` 的转换合法性与
  `requiredGate`/`allowedCompletionGates` 允许集合。

## 范围外

- 不放宽 review/journal 的其他门禁语义；不引入"任意跳过 check"的通用通道。
- 不改动 `environment_failure` 的现行分类实现，只决定"哪些分类可用于豁免"。
