## 执行计划

### S1: 风险评估器模块（engine/risk.ts）
- [x] S1: 风险评估器模块（engine/risk.ts）
- **描述**: 新建 `src/engine/risk.ts`：定义 `RiskTier`（R0–R3）与 `evaluateTaskRisk()` 确定性规则——触碰路径类别（扩展 quick-guard 的 `RISKY_PATH_PATTERNS`为分级路径规则）、契约/API/schema/迁移/CI 触碰信号、影响面（变更文件数）；支持 `.docpath/config.yaml` 的 `risk:` 配置块覆盖（风格沿用 `quick:` 块模式，`src/utils/config` + `quick-guard.ts:75-98` 先例）。
- **验收条件**: 纯函数可单测；各信号→风险等级映射有单测覆盖；config 覆盖生效有单测。
- **依赖**: 无

### S2: 门禁策略 risk × level 函数化（workflow-profile.ts）
- [x] S2: 门禁策略 risk × level 函数化（workflow-profile.ts）
- **描述**: 将 `PROFILE_POLICIES` 静态查表扩展为 `resolveGatePolicy(risk, level, profile)` 策略函数：同 level 下风险越高门禁强度单调不减（如 R2/R3 强制 review、journal full；R0/L1 允许 quick 等效减负）；保留 `gatePolicyForProfile()` 兼容 wrapper（内部委托新函数，risk 缺省 R1 保持现行为）；适配消费点 `done.ts`、`agent.ts`。
- **验收条件**: 四档 profile 对外名与默认行为不变（回归确认）；策略函数有单测；风险单调性由测试断言。
- **依赖**: S1

### S3: 任务创建期风险评估接入（promote / quick）
- [x] S3: 任务创建期风险评估接入（promote / quick）
- **描述**: `backlog promote` 与 `quick` 创建任务时调用 `evaluateTaskRisk()`，把 risk tier 写入任务 spec.json 真源与 state（`StateRegister` 扩展可选字段），并在创建输出与 breadcrumb 留痕。
- **验收条件**: promote/quick 后 spec.json 与 state 可见 risk tier；未评估旧任务缺字段时 fallback R1 不破坏读取。
- **依赖**: S2

### S4: check 期风险复评与升级
- [x] S4: check 期风险复评与升级
- **描述**: 泛化 `check.ts:184-246` 的 quick→standard 自动升级机制：基于实际 diff（复用 `evaluateQuickScope`/git 变更收集）调用 `evaluateTaskRisk()` 复评，新风险 > 已记录风险时只升不降，升级走既有 quick→standard 重写路径并写入 governance decisions 审计记录（`policy.ts:45-56` 先例）。
- **验收条件**: 高风险 diff 触发升级且有审计留痕；风险只升不降有单测；低风险任务行为不变。
- **依赖**: S3

### S5: 矩阵不变量测试与全量回归
- [x] S5: 矩阵不变量测试与全量回归
- **描述**: 新增 risk × gate 矩阵不变量测试文件：断言同 level 下 R0→R3 各门禁项（spec/plan/check/review/journal）要求单调不减；跑全量测试与 lint/typecheck，清理回归。
- **验收条件**: 矩阵不变量测试通过；现有测试套件全绿。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
