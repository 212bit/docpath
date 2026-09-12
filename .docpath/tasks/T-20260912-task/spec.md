# T-20260912-task - 风险分级门禁（包 1）：风险模型 + risk × level 门禁策略 + check 期风险复评

> backlog_id: R-338
> backlog_source: docpath backlog add

## 1. 背景与动机

现状：门禁强度由 `workflow_profile`（quick/standard/strict/instant）× 复杂度级别（L0–L3）静态决定（`src/engine/workflow-profile.ts` 的 `PROFILE_POLICIES`），唯一的风险信号是 `src/engine/quick-guard.ts` 的路径黑名单，且仅用于拒绝 quick 快车道。随着宿主模型能力增强，"流程阶段"作为门禁强度依据正在贬值；真正决定出错代价的是任务风险（契约变更、迁移、CI/CD、核心引擎改动）。

本任务为 R-338 三包规划的**包 1（引擎）**。包 2（文档自动化）、包 3（escalation.ts 处置 + 收尾）落地后另立条目。

已有机制基础：`check.ts:184-246` 的 quick→standard 按实际改动自动升级是"风险复评"的雏形；`quick-guard.ts` 的 `RISKY_PATH_PATTERNS` 是路径风险分类的雏形；`resolveEffectiveWorkflowProfile()` 是策略解析的唯一消费入口。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 任务级风险维度 R0–R3 评估器：确定性规则评估触碰路径类别（扩展 `RISKY_PATH_PATTERNS`）、契约/API/schema/迁移/CI 触碰、影响面（变更文件数）；规则可经 `.docpath/config.yaml` 覆盖，风格沿用现有 `quick:` 配置块模式。
- [ ] FR-2: 门禁策略函数化：`PROFILE_POLICIES` 由 profile 静态查表扩展为 `risk × level` 函数；quick/standard/strict/instant 四档对外命令名与行为兼容性不变。
- [ ] FR-3: check 期风险复评：基于实际 diff 复评风险，风险只升不降；升级泛化现有 quick→standard 自动升级机制，并写入审计记录（governance decisions）。
- [ ] FR-4: risk × gate 矩阵不变量测试：断言同 level 下风险越高门禁强度单调不减（spec/plan/check/review/journal 各项要求）。

### 非功能需求
- [ ] NFR-1: 不引入 LLM 到 CLI 进程内，风险评估保持确定性规则。
- [ ] NFR-2: 保持与现有 DocPath 工作流兼容：既有任务、既有 profile 名、既有命令行为不因默认策略变化而破坏。

## 3. 范围界定

### 包含
- `src/engine/` 新增风险评估模块（含 config 覆盖）
- `src/engine/workflow-profile.ts` 策略函数化及所有消费点适配（`done.ts`、`agent.ts`、`check.ts`、`journal.ts` 等）
- check 期风险复评与升级路径、审计留痕
- risk × gate 矩阵不变量测试 + 相关单测

### 不包含
- 包 2：spec 播种、plan 草稿默认化、journal ADR propose-only（另立条目）
- 包 3：`engine/escalation.ts` 接线或移除（另立条目）
- 对外 CLI 命令名/参数的破坏性变更
- UI/产品功能

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 门禁强度依据 | 按流程阶段 / 按任务风险 | 按任务风险（R0–R3 × level） | 出错代价由风险决定；阶段仪式对强模型是纯成本 |
| 2 | 风险评估实现 | 宿主 agent 自评 / CLI 确定性规则 | CLI 确定性规则 + config 覆盖 | 验证不归执行者；可测试、可复现 |
| 3 | 兼容策略 | 破坏性重设计 / 表内重排 | 表内重排，四档 profile 名不变 | 降低迁移成本，既有任务与文档不受影响 |

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
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 门禁强度与流程阶段挂钩而非与任务风险挂钩，强模型时代阶段仪式成为纯成本，高风险小任务与低风险大任务无法区分对待。
- 目标: 引入任务级风险维度 R0–R3，门禁策略 risk × level 函数化，check 期风险复评只升不降。
- 背景: 来自 backlog R-338；用户于 2026-09-12 会话确认三支柱方向与分期。
- 可选方案:
  - 方案 A: risk × level 策略函数 + 复评升级（本任务）
  - 方案 B: 仅扩展 quick/standard 二分 —— 无法表达"高风险小任务"与"低风险大任务"，放弃
  - 方案 C: 门禁判定交宿主 agent 自评 —— 违反"验证不归执行者"，放弃
- 推荐方案: 方案 A
- 决策理由: 确定性、可测试、兼容表内重排；复评机制有 check.ts 既有先例可泛化
- 不做什么: 不改对外命令名；不引入 LLM 进程内；不覆盖包 2/包 3 范围
- 成本: 中等；引擎策略层 + 各消费点适配 + 测试
- 风险: 默认策略变化可能影响既有任务体验 —— 以 NFR-2 兼容约束与不变量测试兜底
- 回滚方案: 回滚本任务提交；策略函数保留 profile 查表 fallback
- 用户确认: 用户于 2026-09-12 会话中明确回复"同意"确认方向与分期

## 5. 验收标准

- [ ] AC-1: 任务级风险维度 R0–R3 由确定性规则在任务创建时评估，规则可经 `.docpath/config.yaml` 覆盖。
- [ ] AC-2: 门禁策略为 `risk × level` 函数；quick/standard/strict/instant 四档对外命令名与兼容性不变。
- [ ] AC-3: check 期基于实际 diff 复评风险，只升不降；升级有审计记录。
- [ ] AC-4: risk × gate 矩阵存在不变量测试（同 level 下风险越高门禁强度单调不减）。
- [ ] AC-5: 现有测试套件全绿，`docpath check` 门禁通过。
