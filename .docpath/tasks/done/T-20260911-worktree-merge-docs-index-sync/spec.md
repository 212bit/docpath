# T-20260911-worktree-merge-docs-index-sync - 并发开发收口：worktree merge 预检收窄/docs-index 合并治理/版本漂移防护/聚合视图与 sync

> backlog_id: R-335

## 1. 背景与动机

R-334 任务期间与另一活跃会话并发实测：并发底座（worktree 隔离、backlog merge-driver、id 单池分配）已可用，但三个高频卡点：

1. **worktree merge 硬拒绝任何 dirty main**（worktree.ts:1105，`rootStatus.length > 0` 即拒）：并发常态是 main 常有其他会话 in-flight 文件；该预检与 git 自身保护冗余（git merge/checkout 本就拒绝覆盖本地未提交改动），却把"别人的、与合并零重叠的文件"也当阻塞。R-334 实测被迫手动 `git merge --ff-only`。
2. **docs.md/docs-index.json 合并无治理**：机器生成但内嵌扫描时间戳、表行随各树 backlog/tasks 快照分叉 → 两树先后收口必冲突；`.gitattributes` merge-driver 仅覆盖 backlog/rules。
3. **R-332 版本漂移在并发下放大**：全局旧 docpath 静默吞掉 agent_flow 等新行为（R-334 实测 `docpath check` 走全局旧版）；doctor/next 零提示。

次要缺口：无跨树聚合编排视图（需逐树跑 doctor）；main 前进后其他活跃树需手动逐个 merge。

## 2. 需求清单

### 功能需求
- [ ] FR-1: worktree merge dirty 预检收窄——仅当"合并将触碰的文件 ∩ dirty 文件"非空时阻塞，其余降级 warning+文件列表；新增 `--allow-dirty-main <reason>` 证据旗标（breadcrumb 记录，对齐 R-334 --accept-dirty 模式）
- [ ] FR-2: docs-index.json/docs.md 纳入 merge-driver（take-current + regenerate 提示策略），.gitattributes 补条目
- [ ] FR-3: docs 索引生成幂等化——去除内嵌扫描时间戳（或等价稳定化），同状态重生成字节一致
- [ ] FR-4: 版本漂移防护——doctor/next --agent 检测执行二进制非 repo 本地构建（argv[1] vs repoRoot/dist）时 warning + 指引（落实 R-332）
- [ ] FR-5: `worktree list --agent` 聚合视图（各树 task/phase/merged_to_main/建议动作）+ `worktree sync`（main 合入所有活跃 worktree）

### 非功能需求
- [ ] NFR-1: 非 worktree / 非 agent_flow 行为不变
- [ ] NFR-2: 全量套件全绿

## 3. 范围界定

### 包含
- src/commands/worktree.ts（merge/list/sync）
- src/utils/merge-driver.ts + .gitattributes（docs 索引合并）
- src/utils/document-index.ts 或生成点（幂等化）
- src/commands/doctor.ts / next 路由（版本漂移 warning）

### 不包含
- id 分配 TOCTOU（已知限制，保持现状）
- 远端 PR 流程（文档场景 2，不属本地并发范畴）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | dirty main 预检 | A: 完全移除交 git 保护 / B: 收窄为交集判定+旗标 | B | 保留 fail-loud 精神，交集判定零误伤；旗标提供显式证据 |
| 2 | docs 冲突策略 | A: take-current+regenerate / B: worktree 不提交 docs churn | A | merge-driver 已有基础设施，策略一致；B 需要改 staging 语义风险大 |
| 3 | 时间戳去除 | 去掉扫描时间戳行，改由 docs-index.json 内字段承载（已有 timestamp 字段则移除渲染） | 采用 | 渲染幂等是本目标 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 当前问题: 并发开发三卡点——worktree merge 硬拒 dirty main、docs-index 必冲突、版本漂移零提示（R-334 并发实测）
- 可选方案: A 全量四项落地；B 只修 merge+docs；C 维持现状手动绕过
- 推荐方案: A
- 决策理由: 四项均为实测卡点，一次收口避免逐点打补丁（R-306/313/331/334 演进模式）
- 不做什么: 不动 id 分配 TOCTOU 与远端 PR 流程
- 成本: 中等
- 风险: 交集判定需准确计算合并触碰文件；docs 幂等化改变渲染输出（消费方为 agent 只读索引，风险低）
- 回滚方案: 回滚本任务提交
- 用户确认: 2026-09-11 用户经 AskUserQuestion 显式选择「全量落地 A-D（推荐）」（R-335 并发开发收口）

## 5. 验收标准

- [ ] AC-1: main 有与合并零重叠的 dirty 文件时，worktree merge 以 warning 继续（列出文件）；交集非空时仍拒绝；--allow-dirty-main <reason> 记录证据后跳过交集拒绝
- [ ] AC-2: docs-index.json/docs.md 合并走 merge-driver（take-current 策略 + regenerate 提示），不再人工解冲突
- [ ] AC-3: 同一状态下重跑 docs scan，docs.md 字节一致（无扫描时间戳漂移）
- [ ] AC-4: 用全局旧版二进制跑 doctor/next --agent 时输出版本漂移 warning 与本地构建指引
- [ ] AC-5: worktree list --agent 输出各树 task/phase/merged_to_main/建议动作；worktree sync 将 main 合入所有未完成 worktree
- [ ] AC-6: 全量套件全绿；R-335 与任务双向关联
