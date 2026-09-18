# 环境性 check 失败的豁免通道 — 决策简报（R-349 拆分项，2026-09-18）

来源：R-349 分析「范围外」段落；用户已同意方向 A（环境失败不计入 gate）。
状态：**待用户确认边界后实施**（属门禁契约变更，按 AGENTS.md 门禁 5 必须先固化决策简报）。

## 1. 问题与证据

环境性 check 失败目前**没有任何 sanctioned 出口**：

| 事实 | 证据 |
| --- | --- |
| 工具链类失败会被**正确识别**为环境问题并打印诊断 | src/commands/check/runners.ts:131-141（`looksLikeEnvironmentFailure`）；:184-265（runner 探针路径，探针挂起→跳过并标 `environment_failure`）；src/commands/check/evidence.ts:78-87（🔧 环境诊断 + "不是代码问题"） |
| 但仍然落 `check.failed` → `gate=check_fail` | evidence.ts:101-123 `updateCheckWorkflowState(allPassed=false)` |
| `check_fail` 被所有收口路径拒绝 | engine/policy.ts:30（"check_fail 不能完成任务"）；transitions.ts:93 `journal.archived.requiredGate=['review_pass','review_skipped','check_pass']`；R-349a 后 `agent done --skip-check` 亦明确拒绝 |
| 现有旗标覆盖不到 | `--skip-tests`/`--skip-lint` 只削减 runner；`check --force` 仅放行"无活跃任务"守卫（check.ts:154）；无 Docker/stage0 专用通道（`docpath check` 内不含 Docker 校验，docker 只在 detect.ts:331 做项目类型探测） |
| 后果 | Agent 只能 `git commit` 手工收尾、放弃 DocPath closeout（R-349 原始报告的 R-023 做法），工作流证据链断裂 |

## 2. 决策：环境豁免（方案 A）

**用户裁定（2026-09-18）**：边界取 **B3 收紧版**；保留反向开关 **`docpath check --no-env-exempt`**。
以下 2.1 / 2.2 为实现依据。

**方向**：当一次 check 的**全部阻塞性失败**都属环境类时，落一个"环境豁免"态而非 `check_fail`，允许继续 review/归档，但必须留痕。

**为什么这是契约变更**：它让"某个检查没通过"的任务可以完成。因此需要：明确的触发条件、不可绕过的边界、审计留痕、以及非粘性（下次真实失败立即回退）。

### 2.1 关键边界（本次必须选一种：原文描述过粗）

`environment_failure` 有**两条来源**，可信度不同：

| 来源 | 判定方式 | 可信度 | 误判风险 |
| --- | --- | --- | --- |
| **探针类** | 临时目录真实执行 `pnpm run <script>` 探针，挂起/失败 → 判定 runner 在本环境不可用（runners.ts:184-265） | 高（自验证：真跑过） | 极低 |
| **文本启发式类** | 对失败命令的输出正则匹配（runners.ts:34-53） | 中 | **真实风险**：`Cannot find module` / `MODULE_NOT_FOUND` / `ENOENT.*node_modules` 也可能来自**真实的缺依赖或代码问题**；若它是唯一失败项，会被误判为环境问题而整单豁免 |

而 `## 全部失败项都带 environment_failure` 这条限制本身是**结构性可靠**的：结构门禁（spec/plan 漂移、任务身份）与 harness 规则（rules 检查）走 `runTaskDocumentChecks`/`runHarnessChecks`（check.ts:331/339），它们不可能带 `environment_failure` → 混合失败天然仍是 `check_fail`，无需额外策略。

**三个子选项**：

- **B1 严格**：仅**探针类**可豁免。最安全，但覆盖不到"项目脚本里 `docker: command not found`"这类（R-023 场景）——那类走文本启发式。
- **B2 宽松（原文描述）**：任何 `environment_failure` 均可豁免（含 `Cannot find module` 一族）。覆盖面最广，但存在上述误放过真实失败的风险。
- **B3 收紧版（推荐）**：可豁免集 = 探针类 ∪ **工具链不可用语义明确的**文本模式（`command not found` / `not recognized as an internal or external command` / `spawn .* ENOENT`）；而 `Cannot find module` / `MODULE_NOT_FOUND` / `ENOENT.*node_modules` 这类**歧义模式保留为阻塞**（其恢复动作是 `pnpm install` 或修代码，不是豁免）。覆盖面≈B2，风险≈B1。
- **B3 追加收紧（2026-09-18 用户同意）**：`Permission denied.*node_modules` / `EACCES.*node_modules` **移出**可豁免集——权限错误也可能是环境配置/目录所有权问题（可修），不是"工具链缺失"；保留在宽集 `environment_failure` 中维持环境诊断显示。

### 2.2 落状态与审计

- 新事件 `check.env_exempt`（phase=checking，gate=`check_env_exempt`），仅在 2.1 条件满足时由 check 写出；否则维持 `check.failed`。
- **下游等价于 check_pass**：`review.passed/failed/skipped` 与 `journal.archived` 的 `requiredGate` 加入 `check_env_exempt`；`evaluateCompletionPolicy.allowedCompletionGates` 加入它。评审与归档流程一字不改。
- **审计留痕**：`decisions.md` 写 `policy.env_exempt`（列出被豁免项 + 原始报错首行 + 判定来源 probe/text）；`last-check.md` 标 `⚠️ PASS (环境豁免)`；`docpath status`/`next` 显示该 gate。
- **非粘性**：每次 check 重新计算，不做状态标记；下一次真实失败立即回落 `check_fail`。
- **回退开关（建议保留）**：`docpath check --no-env-exempt` 强制按失败处理（默认开启豁免；关闭比开启更不易被顺手滥用）。

## 3. 验收（草案）

- AC-1: 仅探针/工具链类失败（如 pnpm shim 不可用、`docker: command not found`）时，`docpath check` 落 `check_env_exempt` 并明确打印豁免原因 + 留痕条目；`agent done` / `docpath done` 可正常收口。
- AC-2: 混合失败（环境类 + 结构门禁/harness/真实编译测试失败）仍落 `check_fail`，收口被拒。
- AC-3: 歧义模式（`Cannot find module` 等，按所选边界）不触发豁免。
- AC-4: `check --no-env-exempt` 在不满足真实通过时仍落 `check_fail`；豁免态非粘性（随后一次真实失败覆盖）。
- AC-5: 单测覆盖上述四态（含 gate 转换合法性与 `requiredGate` 允许集合）。

## 4. 范围外

- 不放宽 review/journal 的其他门禁语义；不引入"任意跳过 check"的通用通道（那是 R-349 原建议 1，已否决）。
- 不改变 `environment_failure` 的现行分类实现，只按所选边界决定"哪些分类可用于豁免"。
