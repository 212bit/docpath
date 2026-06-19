## 执行计划

### S1: P1 — standalone journal 默认不物理归档
- **描述**: journal.ts `journalCommand` 默认 `archiveMode` 从 `always` 改为 `skip`；`archiveCurrentTask` 在 skip 模式下保留现状（打印 gc 提示，不搬目录）。`--optional-archive=always` 显式 opt-in 老行为；`dry-run` 不变。`agent done` 路径（已 skip）不受影响。
- **验收条件**: standalone `docpath journal` 后 `tasks/<id>/` 仍在、`tasks/current/` 别名仍在、`tasks/done/<id>/` 不新增；`--optional-archive=always` 仍归档。
- **依赖**: 无

### S2: P1 — write-journal 已归档 fail-loud 护栏
- **描述**: write-journal.ts 在写入前检测任务是否已物理归档（canonical `tasks/<id>/spec.md` 不存在 且 `tasks/done/<id>/` 存在）→ fail-loud 提示"任务已归档，write-journal 须在归档前运行"，不再走 `writeActiveTaskFile` 重建僵尸目录。保留其余护栏（Journal Record 已开头则拒绝）。
- **验收条件**: 在已归档任务上跑 write-journal → exit 非零 + 明确错误；不创建 `tasks/<id>/` 或 `tasks/current/` 任何文件。
- **依赖**: 无

### S3: P1 — 移除死 flag --skip-ai
- **描述**: 移除 journal.ts `JournalOptions.skipAi` 字段、`register/quality.ts` 的 `--skip-ai` 选项与传参；清理 agent.ts 调用处的 `skipAi:true`。确认无其他引用。
- **验收条件**: `docpath journal --help` 不再列出 `--skip-ai`；构建通过；`grep skipAi src/` 无残留。
- **依赖**: 无

### S4: P2 — ADR 提取接入 structured spec
- **描述**: 重写 `writeJournalDecisions`/`extractArchitectureDecisionCandidates`：优先从 `structuredSpec.major_change_gate.decision_brief_markdown` 提取推荐方案作为 ADR candidate；其次解析 spec.md「## 4. 关键决策」表每行；breadcrumb 关键词匹配降为兜底。候选带 taskId/context/alternatives。空才跳过。
- **验收条件**: 带 decision_brief 的任务归档后 `decisions.md` 写入对应 ADR；带关键决策表但无 decision_brief 的任务也能写入；breadcrumb-only 任务仍按现状。
- **依赖**: 无

### S5: P3 — lesson 候选引用真实决策
- **描述**: `writeLessonCandidate` 在现有模板基础上追加：P4 提取到的 ADR 摘要（若 S4 产出了 candidate）、decision_brief 推荐方案一句话、breadcrumb 中 `status: blocked` 的步骤列表。保留候选语义（不直接固化）。
- **验收条件**: lesson-candidates.md 新块含 decision_brief 摘要或 blocked 步骤（若存在）；无 decision_brief/blocked 时退化为现状模板。
- **依赖**: S4

### S6: 更新文档
- **描述**: 更新 CLAUDE.md lifecycle（standalone journal 不归档，归档交 `docpath gc --force`；write-journal 须在归档前）；更新涉及 journal 的 docs（若有）。移除 --skip-ai 相关描述。
- **验收条件**: 文档与 S1-S3 实现一致。
- **依赖**: S1, S2, S3

### S7: 测试覆盖新行为
- **描述**: 新增/调整测试：standalone journal 不归档（tasks/<id> 仍在）；--optional-archive=always 仍归档；write-journal 已归档 fail-loud 不建僵尸；P2 decision_brief → decisions.md ADR；P3 lesson 候选含摘要。复用现有 journal 测试 fixture。
- **验收条件**: `pnpm test` 全绿；新断言覆盖 S1-S5。
- **依赖**: S1, S2, S3, S4, S5

### S8: check + review + 实测收口
- **描述**: `docpath check`；`pnpm test` 全量；`docpath review`；在真实任务上实测 journal(默认)→write-journal→gc --force 全链路，验证无僵尸目录、ADR/lesson 落地。
- **验收条件**: check 通过；测试全绿；实测链路无僵尸、知识记录写入 spec.md、归档在 gc --force 完成。
- **依赖**: S4, S5, S6, S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8

## 依赖关系图
S1
S2
S3
S4 → S5
S1 → S6
S2 → S6
S3 → S6
S1 → S7
S2 → S7
S3 → S7
S4 → S7
S5 → S7
S4 → S8
S5 → S8
S6 → S8
S7 → S8
