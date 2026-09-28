# utils/ 域分类法（R-305 治理）

> utils/ 曾是无安置规则的倾倒场（二次架构 review P3）。本文件是唯一分类真源：
> **每个 utils 文件必须归属一个域**，完备性由 tests/build-scripts.test.mjs 断言——
> 新增文件未在此归类会直接挂测试。新代码安置规则见文末。

## 域清单

### state — 工作流状态与互斥
workspace.ts, lock.ts, session.ts, pending-done.ts, lifecycle.ts, current-step-inference.ts

### task-docs — 任务文档（别名/结构化真源/漂移消解）
task-files.ts, structured-docs.ts, structured-heal.ts, plan-sync.ts, plan-topology.ts, doc-parser.ts, workspace-evidence.ts

### gates — 门禁与守卫
git-dirty-guard.ts, ui-gate.ts, major-change.ts, review-skill-router.ts, semantic-verify.ts, auto-format.ts

### git — Git 集成与收口
git-closeout.ts, git-hygiene.ts, git-safety.ts, git-staging.ts, changes-report.ts, merge-driver.ts, worktree.ts, worktree-collaboration.ts, backlog-registry.ts

### context — 上下文构建与索引
context-index.ts, context.ts, document-index.ts, topic-synonyms.ts, milestone.ts, budget.ts, docs-doctor.ts, smart-context.ts, payload.ts, rules.ts, lesson-candidates.ts, deliverables.ts, roles.ts, decisions.ts

### agent-io — Agent 输出/提示/路由
agent-output.ts, agent-output/formatters.ts, agent-output/context-injection.ts, agent-prompt.ts, next-hint.ts, output-formatter.ts, contextual-help.ts, error-messages.ts, error-helpers.ts, logger.ts, closeout-route.ts

### install — 安装/模板/协议分发
install-core.ts, protocol-blocks.ts, detect.ts, package-info.ts, scan-existing-arch.ts, scan-existing-claude.ts, scan-existing-commands.ts, scan-existing-tree.ts

### observability — 追踪与清理
trace.ts, trace-analyzer.ts, trace-matrix.ts, workspace-cleanup.ts, ceremony.ts, version-drift.ts, git-run.ts, breadcrumb.ts, task-metrics.ts

### primitives — 真·通用工具（唯一允许"杂"的域）
file.ts, config.ts, input.ts, stdin.ts

## 新代码安置规则

1. 先判定域：能归入上述域 → 落入该域并更新本清单；不能 → 三问（是否该在
   commands/engine？是否该并入既有文件？是否真的通用到 primitives？）。
2. primitives 收紧准入：与 DocPath 领域概念零耦合才可入。
3. 物理目录搬迁为显式不做项（多深度相对导入 × 全部 dist 测试路径的机械churn
   与组织收益不成比），分类法 + 完备性断言承担治理职能；若未来实施搬迁，
   以本清单为目录蓝图。
