# T-20260911-agent-agent-flow - agent 辅助开发流程摩擦收口：agent_flow 配置面统一降级

> backlog_id: R-334

## 1. 背景与动机

dogfooding 实测四类流程阻碍（T-20260911 breadcrumb 同轮 check 四红：TypeScript 编译/重大决策确认/完成度 1-3/上下文预算）：

1. **重大变更门禁**：major-change.ts `STRATEGIC_CHANGE_FILE_PATTERNS` 对路径做 path-based 信号判定（幅度无关），dogfooding docpath 时每个任务必碰 `src/commands|engine|utils` → 每次都需要 Decision Brief 落 spec + 用户确认 → 门禁被走过场式满足（rubber-stamp）
2. **计划完成度**：plan.ts `renderDraftPlan` level2+ 固定三段式（梳理/实现/验证）；validators.ts `effectivePlanProgress` 要求 `doneCount === totalCount` 才绿（100%），中间态 1/3、2/3 永远红
3. **go dirty guard**：git-dirty-guard.ts `parseStatusLine` 不解引用 git porcelain C-quoting（`\350\276\205...`），导致 CJK 文件名的 backlog 簿记豁免失效；逃生口是隐藏的 `run start --note`
4. **evidence 类型**：workspace-evidence.ts `CheckEvidenceItem.category/severity` 是宽 `string`（JSON schema），与 CheckResult 窄 union 映射需要手写 as/校验器（R-331 实测一次 check 红）

根因：门禁设计前提是"用户项目代码为产品面"，dogfooding 时 docpath 自身即代码面，路径信号全部误报。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `workflow.agent_flow: true` 配置读取链（config.ts 类型 + config.yaml + readDocPathConfig）
- [ ] FR-2: major-change 门禁 agent_flow 降级（STRATEGIC 信号 → advisory warning，依赖/配置/UI 硬信号保留）
- [ ] FR-3: 计划 level≤2 + agent_flow → 单步压缩（renderDraftPlan）
- [ ] FR-4: 完成度门禁 claimed-done 语义（已认领步骤全部 done 即绿，agent done 仍强制 100%）
- [ ] FR-5: `docpath go --accept-dirty <reason>` 首等恢复旗标（breadcrumb 证据记录）
- [ ] FR-6: evidence category/severity 窄化为共享 const union + parse 校验器
- [ ] FR-7: git-dirty-guard CJK 路径解引用（`-c core.quotePath=false` 或手动 unquote）

### 非功能需求
- [ ] NFR-1: 非 agent_flow 行为完全不变（默认 `agent_flow: false` / 缺省 = 现有逻辑）
- [ ] NFR-2: 全量套件全绿（typecheck + test + check）

## 3. 范围界定

### 包含
- `src/types/config.ts`、`src/utils/config.ts`：agent_flow 类型与读取
- `src/utils/major-change.ts`：advisory 信号分流
- `src/commands/check/validators.ts`：完成度 claimed-done + advisory warning
- `src/commands/plan.ts`：level≤2 单步压缩
- `src/commands/go.ts` + `src/utils/git-dirty-guard.ts`：--accept-dirty + CJK unquote
- `src/commands/check/types.ts` + `src/utils/workspace-evidence.ts`：窄 union + 校验器
- tests/check-cache.test.mjs：原有测试 + 新增 agent_flow 行为断言

### 不包含
- 文档/模板/规则更新（跟随 backlog 收口）
- level-1 压缩范围变更（R-306 已覆盖）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | agent_flow 信号降级范围 | A: 全信号降级 / B: 仅 STRATEGIC 工作流路径降级，依赖/配置/UI 硬信号保留 | B | 依赖/配置/UI 变更无论 dogfooding 与否都是真重大变更 |
| 2 | 完成度门禁语义 | A: claimed-done 即绿（防跳步语义保留）/ B: 完成度直接删 | A | 完成度防跳步仍有价值；全完成强制留给 agent done |
| 3 | go 恢复方式 | A: `--accept-dirty` flag / B: 自动放行（agent_flow 模式下） | A | 显式 flag 保留用户/agent 证据，面包屑记录意图（R-330/R-313 证据链延续） |
| 4 | CJK 解引用方式 | A: `-c core.quotePath=false` / B: 手动 unquote | A | `-c core.quotePath=false` 从源头消除，无需在多个 parseStatusLine 调用点重复 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: dogfooding 实测四类流程阻碍（T-20260911 breadcrumb 同轮 check 四红：TypeScript 编译/重大决策确认/完成度 1-3/上下文预算）：1) 重大变更门禁把 docpath 自身 src/commands|engine|utils 路径当重大信号（major-change.ts STRATEGIC 路径判定、幅度无关），每个任务都要 Decision Brief 落 spec + 用户确认；2) 计划 level2+ 固定三段式（plan.ts renderDraftPlan），完成度门禁要求 doneCount===totalCount 才绿（validators.ts:301），中间态 1/3、2/3 永远红；3) docpath go 被 dirty worktree 拦截且逃生口隐藏（run start --note），同时 CJK 文件名 C-quoting 导致簿记豁免失效；4) evidence 宽 string 到窄 union 类型映射摩擦（R-331 实测一次 check 红）
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明全部验收条件，无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-09-11 用户经 AskUserQuestion 显式选择「全量落地（推荐）」，按该方向建档执行（R-334 dogfooding 决策确认）

## 5. 验收标准

- [ ] AC-1: `workflow.agent_flow: true` 在 config.yaml 中可读；`readDocPathConfig()` 返回 `agent_flow: true`
- [ ] AC-2: major-change 门禁：STRATEGIC 路径信号在 agent_flow 下为 advisory（check 警告不红）；依赖/配置信号不变
- [ ] AC-3: 完成度门禁：agent_flow 下已认领步骤全部 done 即绿（1/3 → doneCount=1 但无 in_progress = 绿）；非 agent_flow 不变
- [ ] AC-4: plan level≤2 + agent_flow → 单步压缩（renderDraftPlan 单步）
- [ ] AC-5: `docpath go --accept-dirty "reason"` → 成功 + breadcrumb 记录 `go.accepted_dirty`；无 flag 行为不变
- [ ] AC-6: evidence `category`/`severity` 为 `CheckCategory`/`CheckSeverity` 窄 union；`parseCheckCategory()` 校验器可用
- [ ] AC-7: CJK 文件名在 dirty guard 和 major-change 信号中正确识别（backlog 簿记豁免有效）
- [ ] AC-8: 全量套件全绿（typecheck + test + check）
- [ ] AC-9: backlog R-334 与 T-20260911-agent-agent-flow 双向关联
