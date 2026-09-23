# R-363 分析：收尾路线推荐的 scope 判定缺口

## 根因定位（三处）

### 1. `src/commands/step-pass.ts:101-107` — 静态模板推荐
所有 plan 步骤完成后，无条件打印：

```
- 一键快速收口 (门禁 + 评审 + 提交准备): `docpath quick-done` (推荐)
- 逐步验证门禁: `docpath check` -> `docpath review` -> `docpath agent done`
```

不看本次实际 changed files。改动命中 quick-guard `RISKY_PATH_PATTERNS`（`src/engine/**`、
`src/commands/(agent|check|done|go|journal|review|runtime|register)` 等）时，quick 通道在
done 阶段必拒（`evaluateQuickScope` → `allowed=false`），顺推荐走会白绕一圈。

同样的问题也在 `src/commands/step-pass.ts:70`（无待完成步骤时的引导文案）。

### 2. `src/commands/go.ts:214-219` — 同一段静态模板的复制
`go --step <id> --status done` 且无剩余步骤时打印同样的 quick-done 推荐，同样不做 scope 判定。

### 3. `src/utils/agent-output/formatters.ts:1023` — next_hint 忽略 plan 完成度
```ts
if (!pendingDone && state?.phase === 'executing' && state.task_id
    && !isQuickProfile(state.workflow_profile) && !isTroubleshooting) {
  return { next_action: '开始或恢复任务执行，运行 agent enter 初始化会话',
           recommended_command: 'docpath agent enter', ... };
}
```
只判 `phase === 'executing'`，**不判所有 plan 步骤是否已完成**。而 `step-pass` 把最后一个
步骤标 done 后，`phase` 仍是 `executing`（尚未 check/review/done），于是收口阶段仍返回
执行期的 `agent enter` + 「开始或恢复任务执行」，与同一次输出里的收口路线自相矛盾。

## 可复用原语（无需新造）

- `src/utils/agent-output/formatters.ts:406` 已有 `allPlanDone = planTasks.length > 0 && planTasks.every(t => t.done)`，
  且 `context.planTasks` 在该文件内可直接取得（第 850/992 行已用）。
- `src/engine/quick-guard.ts` 的 `evaluateQuickScope(cwd): QuickScopeVerdict`
  返回 `{ allowed, changedFiles, guardedFiles, reasons, policy }` —— 正是 scope 分类所需，
  且与 done 阶段实际使用的判定同源，避免「推荐」与「门禁」两套口径漂移。

## 实现方案

1. 新增 scope 感知的收口路线生成函数（复用 `evaluateQuickScope`）：
   - `allowed === true` → 保留 `quick-done` 为首推 + 保留逐步路线；
   - `allowed === false` → **不出现 quick-done**，主推 `check -> review -> agent done`，
     并附上 `reasons`（如「改动触及核心路径，quick 通道在 done 阶段会被拒」）。
2. `step-pass.ts` 的两处（70 行、104 行）与 `go.ts:217` 改为调用该函数，消除三处硬编码。
3. `formatters.ts:1023` 分支加 `&& !allPlanDone` 守卫；`allPlanDone` 时改走收口路线
   （推荐 `docpath check` 起步），使 next_hint 在收口阶段不再给执行期提示。

## 测试

- `tests/step-pass.test.mjs` 或新建：核心路径改动 → 输出不含 `quick-done`；叶子改动 → 含。
- next 视图：所有 plan 步骤完成 + phase=executing → `recommended_command` 不是 `docpath agent enter`。
- 注意：`evaluateQuickScope` 依赖真实 git status，测试夹具需真实 git 仓（参考
  `tests/quick.test.mjs` 的 `git()` 夹具写法）。
