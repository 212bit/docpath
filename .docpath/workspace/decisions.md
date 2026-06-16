# 决策日志 — DocPath ADR

> 每条 decision 使用轻量 ADR 模板记录，便于长期检索、审查和上下文披露。

---

## ADR-20260609-044 — review

- task_id: T-20260609-ui-ux-design-preview-gate-visual-accepta
- created_at: 2026-06-09T16:24:45.280Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260609-045 — journal.archive

- task_id: T-20260609-ui-ux-design-preview-gate-visual-accepta
- created_at: 2026-06-09T16:24:45.406Z
- category: journal.archive

### 背景

开始执行: 梳理现有 UI/UX 流程触点与门禁契约
start S1: inspect UI/UX gate insertion points
质量检查失败: 重大决策确认检查
质量检查通过 (8 项)
梳理完成：UI/UX 任务触点为 write-design 命令、check 文档门禁、spec Decision Brief；MVP 不强制 screenshot
已新增 write-design CLI，可写入 design-preview.md 与 visual-acceptance.md
已在 docpath check 中加入 UI/UX Design Preview Gate，缺失或过弱会失败
pnpm build 与 docpath check --skip-tests --skip-lint 已通过
质量检查失败: 测试
质量检查通过 (9 项)
质量检查通过 (10 项)
代码审查: 0 错误, 1 警告, 0 提示

### 决策

归档任务 T-20260609-ui-ux-design-preview-gate-visual-accepta

### 影响

任务进入归档状态；完成 4/4 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260609-ui-ux-design-preview-gate-visual-accepta/spec.md
- .docpath/tasks/T-20260609-ui-ux-design-preview-gate-visual-accepta/plan.md

---

## ADR-20260610-001 — review

- task_id: T-20260609-ui-ux-ui-prompt-brief-design-approval-ga
- created_at: 2026-06-10T01:54:47.247Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 8 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260610-002 — journal.archive

- task_id: T-20260609-ui-ux-ui-prompt-brief-design-approval-ga
- created_at: 2026-06-10T01:55:10.397Z
- category: journal.archive

### 背景

开始执行: 盘点现有 UI/UX gate、模板与 skill 入口
agent-step: S1
开始执行: 新增 UI Prompt Brief 与 Page Brief 模板
agent-step: S2
开始执行: 新增 External Design Handoff 与 Design Approval 模板
agent-step: S3
开始执行: 更新 Codex Skill / Agent UI/UX 指引
agent-step: S4
开始执行: 实现 Design Approval Gate 检查逻辑
agent-step: S5
开始执行: 更新文档、规则与任务流程提示
agent-step: S6
agent-step: S7
开始执行: 运行质量门禁、审查与归档
agent-step: S8
质量检查通过 (8 项)
代码审查: 0 错误, 8 警告, 2 提示

### 决策

归档任务 T-20260609-ui-ux-ui-prompt-brief-design-approval-ga

### 影响

任务进入归档状态；完成 8/8 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260609-ui-ux-ui-prompt-brief-design-approval-ga/spec.md
- .docpath/tasks/T-20260609-ui-ux-ui-prompt-brief-design-approval-ga/plan.md

---

## ADR-20260610-003 — review

- task_id: unknown
- created_at: 2026-06-10T09:21:38.187Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260610-004 — journal.archive

- task_id: unknown
- created_at: 2026-06-10T09:21:43.451Z
- category: journal.archive

### 背景

开始执行: 搭建 UI 构建基础设施
开始执行: 实现 .docpath 数据层
开始执行: 实现侧边栏 + 顶部导航布局
开始执行: 实现项目总览仪表盘
开始执行: 响应式完善与测试
质量检查失败: TypeScript 编译, 测试, UI/UX Design Preview Gate, Plan/Breadcrumb 漂移检查
质量检查失败: Plan/Breadcrumb 漂移检查
质量检查通过 (8 项)

### 决策

归档任务 unknown

### 影响

任务进入归档状态；完成 5/5 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/current/spec.md
- .docpath/tasks/current/plan.md

---

## ADR-20260610-005 — review

- task_id: T-20260610-dashboard-readonly-viewer
- created_at: 2026-06-10T14:36:03.164Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 5 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260610-006 — journal.archive

- task_id: T-20260610-dashboard-readonly-viewer
- created_at: 2026-06-10T14:36:20.999Z
- category: journal.archive

### 背景

开始执行: 恢复前端栈与 dashboard 命令骨架
agent-step: S1
开始执行: 实现只读 JSON API 层
agent-step: S2
开始执行: 前端布局骨架（Sidebar + Header + 路由）
agent-step: S3
开始执行: 实现四个视图页面
agent-step: S4
开始执行: vite 构建 + 命令托管产物
agent-step: S5
开始执行: 门禁与归档
质量检查失败: 任务文件 current/canonical 漂移检查, UI/UX Design Preview Gate, ⚠️  Checklist 同步 (5/6)
质量检查失败: ⚠️  Checklist 同步 (5/6)
agent-step: S6
质量检查通过 (10 项)
代码审查: 0 错误, 5 警告, 0 提示

### 决策

归档任务 T-20260610-dashboard-readonly-viewer

### 影响

任务进入归档状态；完成 6/6 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260610-dashboard-readonly-viewer/spec.md
- .docpath/tasks/T-20260610-dashboard-readonly-viewer/plan.md

---

## ADR-20260612-001 — review

- task_id: T-20260610-ui-gate-hard-constraint
- created_at: 2026-06-12T07:10:03.719Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

需修改: 2 错误, 0 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-002 — review

- task_id: T-20260610-ui-gate-hard-constraint
- created_at: 2026-06-12T07:32:38.002Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 0 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-003 — journal.archive

- task_id: T-20260610-ui-gate-hard-constraint
- created_at: 2026-06-12T07:36:11.140Z
- category: journal.archive

### 背景

agent-step: S3
agent-step: S1
agent-step: S2
agent-step: S4
agent-step: S5
质量检查失败: 任务文件 current/canonical 漂移检查
质量检查通过 (8 项)
代码审查: 2 错误, 0 警告, 0 提示
代码审查: 0 错误, 0 警告, 0 提示

### 决策

归档任务 T-20260610-ui-gate-hard-constraint

### 影响

任务进入归档状态；完成 5/5 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260610-ui-gate-hard-constraint/spec.md
- .docpath/tasks/T-20260610-ui-gate-hard-constraint/plan.md

---

## ADR-20260612-004 — review

- task_id: T-20260612-task
- created_at: 2026-06-12T14:18:27.613Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 5 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-005 — journal.archive

- task_id: T-20260612-task
- created_at: 2026-06-12T14:18:27.712Z
- category: journal.archive

### 背景

开始执行: 定义上下文索引与预算模型
agent-step: S1
开始执行: 扩展 docs scan / index 生成
agent-step: S2
开始执行: 收敛 context/reveal 默认读取行为
agent-step: S3
开始执行: 增加归档按需展开入口
agent-step: S4
开始执行: 高信号化 rules 与 learn 沉淀
agent-step: S5
开始执行: 增加上下文健康 check 门禁
agent-step: S6
开始执行: 测试与验证闭环
agent-step: S7
质量检查通过 (14 项)
代码审查: 0 错误, 5 警告, 0 提示

### 决策

归档任务 T-20260612-task

### 影响

任务进入归档状态；完成 7/7 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260612-task/spec.md
- .docpath/tasks/T-20260612-task/plan.md

---

## ADR-20260612-006 — review

- task_id: T-20260612-cli
- created_at: 2026-06-12T15:33:18.097Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-007 — review

- task_id: T-20260612-cli
- created_at: 2026-06-12T15:35:08.995Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 0 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-008 — journal.archive

- task_id: T-20260612-cli
- created_at: 2026-06-12T15:35:17.553Z
- category: journal.archive

### 背景

开始执行: 定义 init interactive 契约与测试夹具
agent-step: S1
开始执行: 实现 init --interactive 与参数校验
agent-step: S2
开始执行: 改进初始化相关错误提示
agent-step: S3
开始执行: 补充 Getting Started 文档与示例
agent-step: S4
开始执行: 补充测试并运行聚焦验证
agent-step: S5
开始执行: DocPath 收口验证
质量检查失败: 子任务完成度 (5/6)
agent-step: S6
质量检查通过 (13 项)
代码审查: 0 错误, 1 警告, 0 提示
质量检查通过 (13 项)
代码审查: 0 错误, 0 警告, 0 提示

### 决策

归档任务 T-20260612-cli

### 影响

任务进入归档状态；完成 6/6 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260612-cli/spec.md
- .docpath/tasks/T-20260612-cli/plan.md

---

## ADR-20260612-009 — review

- task_id: T-20260612-learn
- created_at: 2026-06-12T16:06:21.612Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-010 — journal.archive

- task_id: T-20260612-learn
- created_at: 2026-06-12T16:06:40.735Z
- category: journal.archive

### 背景

开始执行: 梳理 `learn` 必须过滤 `完成 N/N 步`、`阻塞 N 步`、`推荐保留本次任务的执行经验` 等低信号统计或口号型 lesson。
agent-step: S1
开始执行: 实现 `learn` 必须过滤 `完成 N/N 步`、`阻塞 N 步`、`推荐保留本次任务的执行经验` 等低信号统计或口号型 lesson。
agent-step: S2
开始执行: 验证门禁并归档
质量检查失败: 任务文件 current/canonical 漂移检查, ⚠️  Checklist 同步 (2/3)
agent-step: S3
质量检查通过 (13 项)
代码审查: 0 错误, 1 警告, 0 提示

### 决策

归档任务 T-20260612-learn

### 影响

任务进入归档状态；完成 3/3 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260612-learn/spec.md
- .docpath/tasks/T-20260612-learn/plan.md

---

## ADR-20260612-011 — review

- task_id: T-20260612-decisions-md
- created_at: 2026-06-12T16:43:44.274Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 4 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260612-012 — journal.archive

- task_id: T-20260612-decisions-md
- created_at: 2026-06-12T16:44:08.588Z
- category: journal.archive

### 背景

开始执行: 梳理 decisions.md 老化策略避免无限增长
agent-step: S1
开始执行: 集成到 journal 命令
agent-step: S2
开始执行: 更新文档与 CLI 帮助
agent-step: S3
开始执行: 验证门禁并归档
agent-step: S4
质量检查通过 (14 项)
代码审查: 0 错误, 4 警告, 0 提示

### 决策

归档任务 T-20260612-decisions-md

### 影响

任务进入归档状态；完成 4/4 步，阻塞 0 步。

### 替代方案

- 继续保留在 tasks/current 中
- 只写 breadcrumb 不生成长期 decision

### 相关文件

- .docpath/workspace/breadcrumb.md
- .docpath/workspace/last-check.md
- .docpath/tasks/T-20260612-decisions-md/spec.md
- .docpath/tasks/T-20260612-decisions-md/plan.md

---

## ADR-20260612-013 — review

- task_id: T-20260612-journal-decisions-md-adr
- created_at: 2026-06-12T17:30:39.861Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 4 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-001 — review

- task_id: T-20260613-docpath
- created_at: 2026-06-13T07:54:00.229Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-002 — review

- task_id: T-20260613-handoff-agent
- created_at: 2026-06-13T13:05:16.451Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 3 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-003 — review

- task_id: T-20260613-prompt-omx
- created_at: 2026-06-13T14:13:40.118Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 1 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-004 — review

- task_id: T-20260613-optimize-workflow
- created_at: 2026-06-13T15:02:05.788Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 6 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-005 — review

- task_id: T-20260613-check-checklist
- created_at: 2026-06-13T15:32:54.792Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 4 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-006 — review

- task_id: T-20260613-schema-first-json-jsonl
- created_at: 2026-06-13T17:52:08.411Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 12 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260613-007 — review

- task_id: T-20260613-spec-json-schema
- created_at: 2026-06-13T18:26:19.976Z
- category: review

### 背景

由 DocPath 工作流自动记录。

### 决策

通过: 0 错误, 3 警告

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

## ADR-20260615-001 — policy.skip

- task_id: T-20260615-worktree
- created_at: 2026-06-15T03:42:50.256Z
- category: policy.skip

### 背景

Worktree 基础设施已完成，journal 有 bug 导致 spec 被覆盖，Week 1 功能已验证通过

### 决策

跳过 check

### 影响

影响待后续 review/journal 验证。

### 替代方案

- 未记录替代方案。

### 相关文件

- 未记录相关文件。

---

