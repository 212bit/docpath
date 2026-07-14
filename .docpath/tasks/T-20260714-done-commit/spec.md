# T-20260714-done-commit - done 阶段业务代码未 commit 软提醒门控

> backlog_id: R-260
> backlog_source: docpath brainstorm

## 1. 背景与动机

[来源: 2026-07-13 docpath 项目现场 brainstorm] `docpath done` 流程（`done.ts` 96 行）全程无 git/commit 检查，任务可在工作树残留未提交业务文件时被标记完成，造成"任务 done 但代码未真正进库"的语义谎言。现有硬拦 `src/utils/git-dirty-guard.ts` 的 `assertNoDirtyForXxx` 只在**任务启动**时拦 dirty worktree，收尾不拦。

### 核实事实（2026-07-13 现场核实）
- `src/commands/done.ts` 全文无 git/commit 关键词，`agent done` 序列 `check → review → journal` 不测工作树是否干净。
- `src/utils/git-dirty-guard.ts:60` `isDocPathManagedPath` 已把 `.docpath/` 自身文件与业务文件分流；`nonDocPathFiles` 已暴露（line 155-164）。
- `changes --agent` 的 `ready_to_commit`（`changes-report.ts:417`）是 read-only 报告，不是门禁。
- `tests/dirty-worktree-guard.test.mjs` 已存在，保护现有 guard 行为。

### 关键决策（brainstorm Q1–Q3 收敛）
- **Q1 门控强度 = 软提醒，不硬拒（选 b）。** 在单人多 agent 环境下，硬拦会把"属于其他任务/agent 的脏文件"算到当前完成任务的头上，逼 agent 误 commit 或 stash；"被门禁卡得没法干活"比"代码没进库"更糟。DocPath 不抢 commit 执行权，与 `changes` 的 read-only 立场一致。
- **Q2 组织形态 = 单人多 agent。** 并行编排时硬拒的"场景 3 的笨"真实会咬人，进一步坐实软提醒。
- **Q3 提醒形态 = W2 列文件名 + 免责声明（选 c）。** 给够信息让 agent 不必另跑 `git status`，又用免责防 agent 笃定照搬 commit 混合改动。

### 例 C 推导的约束
纯改 `.docpath/`（如 journal 刚写的产物）、业务零改动时必须**放行不拦** —— 否则每个完成任务被自己刚写的 journal 卡住，自相矛盾。故 DocPath 自身产物不计入提醒。

### 范围切分（2026-07-14）
FR-5/FR-6（changes --agent task-aware 归组）切分至独立 backlog R-262（level 2），不在本任务范围。本任务仅含 done 软提醒 FR-1~4。

## 1.1 已有证据

### 需求澄清历史 (brainstorm)

2026-07-13 苏格拉底式 brainstorm（Q1–Q3 收敛）：门控强度=软提醒不硬拒 / 多 agent 编排场景 / W2 列文件+免责声明。

## 2. 需求清单

### 功能需求
- [ ] FR-1: done 命令检测工作树中 non-DocPath 未提交文件，存在时打印软提醒，不阻断流程退出码
- [ ] FR-2: 提醒列出未提交业务文件清单 + 建议 commit 命令，并附免责声明（文件可能混合多个任务/agent，请确认归属后再 commit）
- [ ] FR-3: DocPath 自身产物（.docpath/）不计入提醒计数与清单
  - 来源 backlog: R-260
- [ ] FR-4: 提醒输出可通过标志（如 --no-dirty-reminder 或 profile 策略）静音，默认开启

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容（done 退出码不变、不抢 commit 执行权）

## 3. 范围界定

### 包含
- done 命令收尾阶段的业务文件未提交软提醒（检测 + 列清单 + 免责 + 静音 flag）
- DocPath 自身产物不计入提醒
- 复用 isDocPathManagedPath / nonDocPathFiles 现成分流

### 不包含
- changes --agent 的 task-aware 归组能力（FR-5/FR-6，已切分至 R-262）
- 硬拒门控（明确决策:软提醒不阻断）
- 任何自动 commit 执行（DocPath 不抢 commit 执行权）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 门控强度 | 硬拒 / 软提醒 | 软提醒 | 单人多 agent 硬拒会卡并行编排 |
| 2 | 提醒形态 | W1 报数 / W2 列文件+免责 | W2+免责 | 信息够 + 防笃定照搬混合 commit |
| 3 | DocPath 产物 | 计入 / 不计入 | 不计入 | 避免刚写的 journal 卡自己 |
| 4 | 范围切分 | 含 changes 归组 / 切出 | 切出 R-262 | scope 不同,混让 plan/review 难做 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: done 阶段无 git 检查 → 任务可在残留未提交业务文件时被标记完成
- 目标: done 收尾时对 non-DocPath 未提交业务文件打印软提醒(不阻断),提示 agent/人显式确认归属后再 commit
- 可选方案:
  - 方案 A: 软提醒(done 不阻断,列文件+免责)
  - 方案 B: 硬拒(非 DocPath 脏则拒绝 done)
- 推荐方案: 方案 A
- 决策理由: 单人多 agent 场景,硬拒把别 task/agent 的脏文件算到当前完成任务的头上,体验比"代码没进库"更糟;DocPath 不抢 commit 执行权,与 changes 的 read-only 立场一致
- 不做什么: 不自动 commit;不阻断 done;不含 changes --agent 归组(切至 R-262)
- 成本: 小(done 命令内复用现成分流 + 一段打印)
- 风险: 软提醒可能被 agent 忽略;缓解: 醒目 warning + 列文件 + 免责防笃定
- 回滚方案: 移除 done 中软提醒调用,backlog R-260 退回 proposed

## 5. 验收标准

- [ ] AC-1: 工作树有业务文件未提交时,done 输出含醒目软提醒并列出文件名
- [ ] AC-2: 工作树只有 .docpath/ 文件未提交(纯 DocPath 产物)时,done 不打印业务提醒
- [ ] AC-3: 提醒含免责声明,提示文件可能混合多任务/多 agent
- [ ] AC-4: 存在未提交业务文件时,done 退出码仍为 0(软提醒不阻断)
- [ ] AC-5: --no-dirty-reminder(或等效 flag)可静音提醒

---

*此文件由 `docpath write-spec` 重写（2026-07-14 demote 后）:FR-1~4 进真源,FR-5/6 切至 R-262,major gate 降为否。*
