# T-20260618-enforce-complete-docpath-plan-contract - Enforce complete docpath plan contract

> backlog_id: R-204
> backlog_source: docpath backlog capture

## 1. 背景与动机

Dogfooding showed that `docpath plan` can write an incomplete plan that covers only the first functional requirement, while still advancing workflow state to `planning`. That is a contract violation: downstream `go`, `check`, `review`, and closeout operate on the persisted plan as machine truth.

For implementation tasks, `plan` must either persist a plan that covers the spec requirements and acceptance criteria, or fail before writing/advancing with actionable diagnostics. A partial plan is worse than no plan because it creates false workflow confidence.

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath plan` must validate generated plan coverage before persisting `plan.md` / `plan.json`.
- [ ] FR-2: Plan coverage validation must require references to each functional requirement id (`FR-*`) declared in the spec.
- [ ] FR-3: Plan coverage validation must require references to each acceptance criterion id (`AC-*`) declared in the spec.
- [ ] FR-4: When generated plan coverage is incomplete, `docpath plan` must fail without writing plan artifacts or advancing workflow state.
- [ ] FR-5: Failure diagnostics must list the missing requirement and acceptance ids and tell the user to refine/write a complete plan.

### 非功能需求
- [ ] NFR-1: `write-plan` should keep accepting explicit user-authored plans that pass the existing structural contract; the new completeness gate is specific to generated `docpath plan` output.
- [ ] NFR-2: Existing tests for normal plan generation and write-plan behavior must remain compatible unless they intentionally exercise incomplete generated output.
- [ ] NFR-3: The validator should be deterministic and not depend on LLM behavior or markdown prose heuristics beyond explicit ids.

## 3. 范围界定

### 包含
- Spec id extraction for FR/AC coverage.
- Generated plan coverage validation before persistence.
- Fail-loud diagnostics for missing ids.
- Regression tests proving incomplete generated plans do not write or advance state.

### 不包含
- Replacing the prompt contract with an actual LLM call.
- Full semantic task planning quality scoring.
- Enforcing completeness on `write-plan` for manually authored recovery plans.
- UI design workflow changes.

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | Coverage signal | Infer semantics from prose / require explicit FR/AC ids | Require explicit ids | Deterministic and testable; avoids vague prose matching. |
| 2 | Enforcement point | Validate in `write-plan` / validate generated `plan` output before write | Validate generated `plan` output before write | Fixes the unsafe automatic writer without breaking explicit manual recovery plans. |
| 3 | Failure behavior | Write partial plan with warnings / fail before mutation | Fail before mutation | Prevents machine truth from becoming incomplete. |

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
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: `docpath plan` 可写入不完整 plan 并推进状态，后续流程会建立在不合格 machine truth 上。
- 目标: 让生成式 plan 在写入前具备最低覆盖契约，缺失覆盖时 fail-loud 且不改变状态。
- 背景: 用户明确指出该问题应优先处理，因为后续所有流程都会基于 plan。
- 可选方案: 只优化 prompt；在 check 阶段发现；在 plan 写入前验证；强制所有 write-plan 都验证。
- 推荐方案: 对 `docpath plan` 的生成输出做 FR/AC id 覆盖验证，缺失则拒绝写入并列出缺口。
- 不做什么: 不引入语义评分；不改变手工 `write-plan` 的恢复能力；不触碰 UI gate。
- 成本: 增加解析/验证逻辑和回归测试；旧测试中无 id 的生成 plan 需要补齐。
- 风险: 既有 specs 如果没有显式 FR/AC id，coverage gate 没有可验证对象；这种情况下保持现有结构校验。
- 回滚方案: 移除生成 plan coverage preflight，恢复原 plan 写入路径。
- 用户确认: 用户明确要求先做 docpath plan 契约问题，并继续要求 dogfood 修复暴露问题。

## 5. 验收标准

- [ ] AC-1: Multi-FR/multi-AC spec 下，`docpath plan` 生成的 plan 若缺少任何 FR/AC id，命令失败且不写 `plan.md` / `plan.json`。
- [ ] AC-2: 失败输出列出缺失的 FR/AC id，并提示使用 `docpath write-plan` 写入完整计划。
- [ ] AC-3: 成功的 generated plan 必须包含全部 FR/AC id，且状态正常推进到 planning。
- [ ] AC-4: `write-plan` 现有结构校验行为保持不变。
- [ ] AC-5: 回归测试覆盖失败不落盘、不推进状态、成功落盘三条路径。
