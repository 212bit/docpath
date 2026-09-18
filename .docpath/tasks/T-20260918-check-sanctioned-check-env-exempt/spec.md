# T-20260918-check-sanctioned-check-env-exempt - 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道

> backlog_id: R-350

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [x] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
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

## 5. 验收标准

- [ ] AC-1: 仅探针类/工具链类失败时（如 pnpm shim 不可用、`docker: command not found`），
- [ ] AC-2: `docpath check` 落 `check_env_exempt`，打印豁免原因并留痕；随后 `agent done` /
- [ ] AC-3: `docpath done` 能正常收口。
- [ ] AC-4: 混合失败（环境类 + 结构门禁/harness/真实编译测试失败）仍落 `check_fail`，
- [ ] AC-5: 收口被拒（契约不回退）。
- [ ] AC-6: 歧义模式（`Cannot find module` / `MODULE_NOT_FOUND` / `ENOENT.*node_modules`）
- [ ] AC-7: 不触发豁免，仍落 `check_fail`。
- [ ] AC-8: `docpath check --no-env-exempt` 下即使全是环境失败也落 `check_fail`；
- [ ] AC-9: 豁免态非粘性（随后一次真实失败覆盖为 check_fail）。
- [ ] AC-10: 单测覆盖上述四态，含 `check.env_exempt` 的转换合法性与
- [ ] AC-11: `requiredGate`/`allowedCompletionGates` 允许集合。
- [ ] AC-12: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-13: backlog 条目 R-350 与任务 T-20260918-check-sanctioned-check-env-exempt 建立双向关联
