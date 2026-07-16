# R-276 分析: review skill router 口径与 commit-first 惯例的系统性绕过 (2026-07-16, 代码核验)

## 机制核验 (三个事实叠加成完整绕过链)

| # | 事实 | 证据 |
| --- | --- | --- |
| F1 | review 默认 scope='all' = 仅工作区 (unstaged+staged+untracked); 树干净 ⇒ changedFiles 空 ⇒ router `not_required` | review.ts collectChangedFiles/collectStatusChangedFiles (git status --porcelain); R-274 收口实测 not_required, R-275 未提交实测 fired |
| F2 | commit-first 收口惯例被重大变更门禁的信号设计所鼓励 (major-change.ts 扫 git status, 非重大变更过门的最简路径=先提交清空信号, R-272/R-274 先例已入 rules gotcha) ⇒ 语言级审查在该惯例下被系统性绕过 | rules/style.md R-274 gotcha; major-change.ts collectMajorDecisionSignals |
| F3 | done 的 review 复用是纯时间窗 (GATE_EVIDENCE_FRESH_MS=60min) + gate=review_pass, 不绑 HEAD/指纹 ⇒ 即使 review 先于提交, 提交后 done 也不会重审 | agent.ts:60,319-329 canReuseReviewGate; workspace-evidence.ts ReviewEvidence 无 HEAD/fingerprint 字段 |

## 已有但未接线的基础设施

- `ReviewScope` 类型含 `task` (router + review.ts 均支持); review.ts 的 task 口径语义正确: collectTaskChangedFiles = 任务 started_at 以来的提交文件 (git log --since) ∪ 工作区变更; diffForFile(task) = baseRef..HEAD + 工作区 diff, baseRef=任务内首提交^ (resolveTaskBaseRef)。
- 缺口 1: CLI 枚举未放行——register/quality.ts:62 normalizeEnumOption 只允许 all|staged|last_commit, `--scope task` 会被拒。
- 缺口 2: router 的指纹 task 分支 (review-skill-router.ts:100-103) 用 `git log --follow --patch` 全历史, 与 review.ts 的任务基线口径不一致 (语义错 + 大文件历史有性能面), 若启用 task 需对齐。
- 缺口 3: review evidence 未记录 HEAD, 复用无法感知 review 后的新提交。

## 方案 (需用户裁定)

- **方案 A (推荐): review 默认口径 all → task**。有活跃任务且 started_at 可解析时默认 task (无任务/解析失败回退 all); CLI 枚举放行 task; router 指纹 task 分支对齐 review.ts 基线口径; write-review-skill 同步。可选加固: review evidence 记录 HEAD, canReuseReviewGate 在 HEAD 变化时拒绝复用。效果: 语言审查覆盖任务累计 diff, 与提交时序解耦, 不触碰重大变更门禁 (二者机制独立, 无 R-274 式互锁)。成本: 任务内每次提交推进都会更新指纹, 重复 review 需重写证据 (正是门禁本意)。
- 方案 B: 惯例改为 review 先于 commit (纯规则/文档)。否点: 靠自觉无机器强制; 与重大变更门禁 commit-first 缓解路径直接冲突 (碰策略文件必须先提交才消信号, 否则每次都要填 是+用户确认)。
- 方案 C: done 时树干净则强制 last_commit 口径重审。否点: 只covers最后一笔, 多提交任务仍漏; 与 F3 复用逻辑叠加后仍可绕。
- 方案 D: 维持现状, 仅规则记录边界。否点: 语言级审查对遵守惯例的 agent 恒为空转, 门禁形同虚设。

## 方案 A 的验收草案 (裁定后细化)

- AC-1: 活跃任务内 (含多次提交后) `docpath review` 的 router requirements 覆盖任务累计 diff 的 TS/JS 文件; 树干净但任务有提交时不再 not_required。
- AC-2: 无活跃任务时行为回退 all, 与现状一致。
- AC-3: router 指纹 task 口径 = baseRef..HEAD + 工作区, 与 review.ts 一致; 同一任务同一状态下指纹稳定。
- AC-4: (若采纳加固) review 后新提交 ⇒ done 拒绝复用并重审。
- AC-5: pnpm test 全绿, R-275 式 write-review-skill 流程在 task 口径下走通。
