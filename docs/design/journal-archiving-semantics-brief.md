# Decision Brief: `docpath journal` 知识归档语义修复（P1+P2+P3）

> 状态：**待确认**（pre-implementation）
> 范围：`docpath journal` / `docpath write-journal` 的归档时序、ADR 提取、lesson 候选
> 相关：T-20260619-fix-worktree-tracked-resource-contract-o 的归档实测（"未发现可复用 ADR，跳过"）

## 背景

`docpath journal` 头注释声称「从完成的任务中提炼结构化知识，更新 spec.md 的架构决策记录」。实测暴露三处名实不符：

### P1 — 时序缺陷（最关键）

standalone `docpath journal`（`archiveMode` 默认 `always`）在**同一次运行**里：
1. `emitJournalPrompt` 打印"完成后运行: docpath write-journal"（journal.ts:142）
2. 紧接着 `archiveCurrentTask` 把 `tasks/<id>/` 搬到 `tasks/done/<id>/` 并清 `tasks/current/` 别名（journal.ts:147）

后果：按提示去跑 `docpath write-journal` 时任务已归档：
- `readActiveTaskFile` 找 canonical（已搬走）+ current（已清）→ 返回空串
- write-journal 仅警告"spec.md 看起来不像正常规范文档"（write-journal.ts:50，空内容也只 warn 不拦）
- `writeActiveTaskFile` → `ensureActiveTaskDirs` **重建** `tasks/<id>/` + current 别名，写回只含 Journal Record 的 spec.md → **僵尸任务目录**（原 spec 在 done/，新写的在 canonical/）
- `assertActiveTaskFileWriteAllowed`（task-files.ts:211）只查 task_id 不匹配，**不查是否已归档**，故不 fail-loud

注：`agent done` 调 journal 时用 `quietPrompt:true, archiveMode:'skip'`（agent.ts:292），**不踩 P1**。P1 仅 standalone journal 路径。

### P2 — ADR 提取过于脆弱

`extractArchitectureDecisionCandidates`（journal.ts:71）要求 breadcrumb `context` 行**同时**命中：
- `/架构|architecture|边界|模块|接口|数据模型|状态机/i`
- `/决策|采用|改为|统一|使用|保留|拆分/i`

多数任务的 breadcrumb context 不含这些关键词 → `writeJournalDecisions` 走"未发现可复用 ADR，跳过"。structured spec 已有 `major_change_gate.decision_brief_markdown`（journal.ts:336 已读给 backlog），却没用于 ADR 提取。

### P3 — lesson 候选是占位

`writeLessonCandidate`（journal.ts:412）写固定模板"推荐保留本次任务的执行经验：完成 X/Y 步"，不引用任务实际的决策/教训。真正的固化 deferred 到 `docpath learn`，但候选本身无内容可固化。

### 附带：`--skip-ai` / `skipAi` 是死 flag

journal.ts:34 声明 `skipAi?`，但函数体从不读取。CLI 仍暴露 `--skip-ai`。

## 修复方案（P1+P2+P3 一起）

### P1 — 对齐 agent done（用户已确认）

standalone `docpath journal` **不再同次物理归档**：
- `archiveMode` 默认从 `always` 改为 `skip`（与 `agent done` 一致）
- 物理归档统一交给 `docpath gc --force`
- journal 仍做：状态推进（`journal.archived`）、backlog 回填、lesson 候选、decisions、gc
- 写 spec.md 知识记录由 `docpath write-journal` 在任务**活跃期**完成（归档前），时序打通

护栏：
- `write-journal`：检测到任务已归档（canonical 不存在且 done/ 存在）→ **fail-loud**，提示"任务已归档，write-journal 须在归档前运行"，不再重建僵尸目录
- 保留 `--optional-archive=always` 显式 opt-in 老行为（向后兼容 + 测试）
- `archiveMode='dry-run'` 语义不变

### P2 — ADR 提取接入 structured spec

`writeJournalDecisions` 改为优先从 `structuredSpec.major_change_gate.decision_brief_markdown` + spec 的「关键决策」表提取 ADR；breadcrumb 关键词匹配降级为补充来源。具体：
- 若 structured spec 有 decision_brief → 以其"推荐方案/决策"为 ADR candidate（带 taskId/context/alternatives）
- 若 spec.md「## 4. 关键决策」表有行 → 每行一条 candidate
- breadcrumb 关键词匹配保留为兜底
- 候选为空才跳过（现状语义不变，但命中面大幅扩大）

### P3 — lesson 候选引用真实决策

`writeLessonCandidate` 在模板基础上追加：
- 任务实际 ADR（P2 提取到的）摘要
- decision_brief 的"推荐方案"一句话
- breadcrumb 中 `status: blocked` 的步骤（真实踩坑点）
仍保留"候选"语义（不直接固化，留给 `docpath learn`），但候选有可固化内容。

### 附带 — 清理死 flag

移除 `--skip-ai` / `skipAi`（未被使用），或接回真实逻辑（journal 本就不调 LLM，prompt 是给当前 session 的）。倾向移除。

## 影响与边界

- **数据契约**：无；不改文件格式。
- **工作流行为**：standalone journal 不再物理归档——用户需知道归档改由 `docpath gc --force`。需更新 CLAUDE.md lifecycle 与 docs。
- **向后兼容**：`--optional-archive=always` 保留老行为；`agent done` 路径不受影响（本就 skip）。
- **测试**：
  - 新增 standalone journal 不归档（tasks/<id> 仍在、current 别名仍在）的断言
  - 新增 write-journal 在已归档任务上 fail-loud 的断言
  - 新增 P2：带 decision_brief 的任务 → decisions.md 写入 ADR
  - 新增 P3：lesson 候选含 decision_brief 摘要
  - 调整现有 journal 测试（若依赖默认归档）
- **不在本次范围**：P4（注释名实不符）随 P1-P3 自然修正；`merged_to_main` 语义（另议）；`docpath learn` 固化逻辑（P3 只改候选内容）。

## 待用户确认

1. P1 方案 = 对齐 agent done（已确认）。
2. `--skip-ai` 死 flag：移除 ✅ 还是接回？
3. P2 的 ADR 来源优先级：structured decision_brief > spec 关键决策表 > breadcrumb 关键词，是否认可？
4. 走完整 DocPath 流程（brainstorm→spec→plan→implement）落地，对吗？
