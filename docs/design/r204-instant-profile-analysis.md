# R-204 分析:instant profile 跳 check(留 typecheck)

## 背景

R-204 原始框架"运行时 FSM 忽略 level"经核实需修正:运行时门禁看的是 `workflow_profile`(quick/standard/strict),不是 `level`(0-3)。`level` 只是 `evaluateComplexity` 的关键词推荐,运行时无任何分支基于它放行门禁(仅 `reveal.ts:249` 用于展示)。

真实缺口:没有任何档位跳过 `check`(build+test+typecheck+plan-sync+major-change)。L0("即时响应,1-2步,直接执行")设计上该"直接执行",但运行时仍强制 check。`done --skip-check` 存在但手动、无策略守卫。

## 决策(已与用户确认)

1. **加 `instant` profile**(requiresCheck=false, requiresReview=false, journalMode=minimal),由 quick-guard 守卫(≤3 文件、无风险路径)。
2. **跳 check 但留 typecheck**:instant 完成时跑轻量校验 = typecheck(`tsc --noEmit`)+ plan-sync + major-change-gate,跳 build+test。

## Technical

- `workflow-profile.ts`:WorkflowProfile 加 `'instant'`;PROFILE_POLICIES.instant = { spec❌ plan❌ check❌ review❌ journal:minimal };normalizeWorkflowProfile 接受 'instant'。
- `check.ts`:typecheck 是独立检查项(`detectCompileChecks` → `tsc --noEmit`),与 build(tsup)/test 分离。新增 lite 路径:仅跑 typecheck + 结构性门禁(plan-sync、task-file-drift、major-change-gate、context-health),跳 build+test+lint。
- `agent.ts runAgentCheckGate`:profile=instant 时调 checkCommand 的 lite 模式(非 skipCheck 全跳)。`runAgentReviewGate`:instant 同 quick 跳 review。
- `done.ts`:门禁序列输出区分 instant。
- quick-guard.ts:instant 复用 quick 的范围守卫(≤3 文件、无风险路径)。
- 进入 instant 的入口:`docpath quick` 增 `--instant` 或新 `docpath instant` 命令?待 plan 定。

## Open Questions

- instant 入口命令形态:`quick --instant` flag vs 独立 `instant` 命令?(倾向 flag,复用 quick-guard)
- instant 是否允许 `--enforce`?(quick 已有 enforce 语义,复用)

## 验收

- `instant` profile 可创建并完成,跳过 build+test,保留 typecheck+plan-sync+major-change-gate。
- quick-guard 守卫 instant(超范围/风险路径拒绝)。
- 全量测试绿;新增 instant profile 测试。
