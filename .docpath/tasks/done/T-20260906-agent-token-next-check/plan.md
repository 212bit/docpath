## 执行计划

### S1: 重大变更门禁指引修正
- [x] S1: 重大变更门禁指引修正
- **描述**: `src/utils/major-change.ts` formatMajorChangeGateFailure 的"出路一"改为指向 `docpath write-spec --stdin`（含"门禁勾选是 + Decision Brief 含用户确认行"的完整步骤），说明手改 spec.md 会被 heal 以 json 真源覆盖；出路二保持不变。
- **验收条件**: 失败消息含 `write-spec --stdin` 与"手改 spec.md 会被覆盖"警告；不再出现"在 spec.md 中填写"的手改指引；新增单测断言。
- **依赖**: 无

### S2: next --agent 输出瘦身
- [x] S2: next --agent 输出瘦身
- **描述**: `src/utils/agent-output/formatters.ts`（及 next 路由组装处）移除常规输出中的 gate_policy 字段、context_injection.spec_summary 收敛为 title-only、recent_decisions 裁至 2 条；保留 next_action/recommended_command/exit_criteria/state/phase/progress/install_health/context_refs。
- **验收条件**: next --agent 输出不含 gate_policy；recent_decisions ≤2；spec_summary 无 requirements 展开；next_hint 核心字段完整；既有 next 相关用例更新并新增断言。
- **依赖**: S1

### S3: agent step 批量补账
- [x] S3: agent step 批量补账
- **描述**: `src/commands/agent.ts` 的 step 子命令 `--step` 参数支持逗号分隔（如 `S1,S2,S3`）：逐个执行 claim（go 语义）+ done，任一步骤失败即中止并列出已完成项，输出逐项结果；单步骤行为不变。
- **验收条件**: 批量补账用例（3 步成功路径 + 中途失败中止路径）通过；单步骤既有用例不回归。
- **依赖**: 无

### S4: check 环境失败分类与 fail-fast
- [x] S4: check 环境失败分类与 fail-fast
- **描述**: check 的编译/构建/测试门禁执行层（`src/commands/check*`）识别已知环境错误签名（`ERR_PNPM_`、`Aborted removal of modules directory`、`Command failed` 且来自 pnpm install 阶段）：归类为"环境失败"，输出修复指引（确认 pnpm 版本/允许 install/TTY 或 CI 变量），并跳过后续门禁不再级联全跑；非环境失败维持现有逐项报告。
- **验收条件**: 模拟环境签名输出时 check 报"环境失败"并 fail-fast（不跑 build/test）；常规编译错误仍逐项报告；新增单测。
- **依赖**: 无

### S5: 全量验证与收尾
- [x] S5: 全量验证与收尾
- **描述**: 全量测试 + typecheck 绿；四项验收逐条核对。
- **验收条件**: pnpm test / typecheck 全绿；AC-1~AC-4 有测试证据。
- **依赖**: S1, S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
