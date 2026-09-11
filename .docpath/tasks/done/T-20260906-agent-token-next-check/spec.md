# T-20260906-agent-token-next-check - Agent token 效率修复: 门禁指引/next 输出瘦身/批量补账/check 环境分类

> backlog_id: R-317
> backlog_source: docpath backlog add

## 1. 背景与动机

2026-09-07 会话对 T-20260830 收口时的实证评估（trace 1486 条 + 一手体验）确认四项 token 浪费点，用户已确认修复：

1. **重大变更门禁死胡同指引**：失败消息指导手改 spec.md 的 Decision Brief，但 spec.json 已存在时 heal 按 json→md 方向覆盖手改，真实出路是 `docpath write-spec --stdin` 重写。死胡同导致 Agent 读源码排查（单次 ~2-3 万 token 纯浪费）。
2. **next --agent 全量重注入**：每次调用完整输出 gate_policy（静态）、context_injection（spec_summary + 5 条 recent_decisions）、install_health，遥测 164 次调用无任何 diff 机制。
3. **倒挂补账 2N 次调用**：N 个已完成步骤追认需 `go --step X` + `agent step X --status done` 循环 N 次（遥测 go 失败率 33% 即此错位的体现）。
4. **check 无环境/代码分类**：pnpm 环境失败（如 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`）被误报为"TypeScript 编译, 构建, 测试"三项全挂，Agent 需多轮诊断才发现是工具链问题。

## 2. 需求清单

### 功能需求
- [ ] FR-1: Agent token 效率修复: 门禁指引/next 输出瘦身/批量补账/check 环境分类
  - 来源 backlog: R-317

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Agent token 效率修复: 门禁指引/next 输出瘦身/批量补账/check 环境分类

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
- [x] 工作流 / Agent 行为变更

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 问题: 四个已实证的 token 浪费点（门禁死胡同指引 / next 全量重注入 / 补账 2N 次调用 / check 无环境分类）抬高 Agent 每任务成本
- 方案:
  - A 输出层与信息层修整: 只改失败指引文案、next 输出字段、agent step 批量解析、check 失败分类，不动 FSM 转移与门禁语义
  - B 引入跨调用状态哈希去重: 需要 next 写缓存文件，破坏只读咨询定位
  - C 全部维持现状: 浪费持续累积
- 选择: A
- 理由: 四项均为输出/信息层修整，不改状态机转移与门禁拦截语义；B 违反 next 只读契约，C 无视实证
- 风险: next --agent 输出契约变化可能影响依赖这些字段的消费方 → 保留全部路由核心字段（next_action/recommended_command/exit_criteria/state/phase/progress），只删静态与冗余字段
- 用户确认: 2026-09-07 用户在评估对话后明确指示"同意修复这些问题"，范围即本 spec 四项

## 5. 验收标准

- [ ] AC-1: ① 重大变更门禁失败消息的"出路一"指向 `docpath write-spec --stdin`（json 为真源时的真实路径），不再引导手改 spec.md；含完整步骤。
- [ ] AC-2: ② `next --agent` 输出瘦身：gate_policy 移出常规输出（或仅 profile 变更时出现）、recent_decisions 裁至 2 条、spec_summary 只留 title。单次输出 token 明显下降（用例断言字段存在性）。
- [ ] AC-3: ③ `docpath agent step --step "S1,S2,S3" --status done` 支持逗号分隔批量补账：内部逐个 claim+done，任一失败报错并中止后续，输出逐项结果。
- [ ] AC-4: ④ check 门禁执行层失败时先做环境预检/签名识别：匹配已知 pnpm/node_modules 环境错误签名时归类为"环境失败"并给出修复指引，不继续级联跑后续门禁。
- [ ] AC-5: 全量测试与 typecheck 绿；四项均有直接测试断言。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-317 与任务 T-20260906-agent-token-next-check 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
