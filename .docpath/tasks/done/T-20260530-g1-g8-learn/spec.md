title: "完成 next-phase 路线图尾部：生命周期哨兵 + journal→learn 管线 + docs-index 验证"

level: 2

background: |
  对 docs/design/next-phase-tasks.md 路线图与当前源码逐项核对后发现，绝大部分已落地：
    - P0：phase/gate 拆分 (state-machine.ts)、transitionWorkflow (transitions.ts)、
      policy.canComplete (engine/policy.ts) 均已实现。
    - P1：next/status --agent 结构化 YAML 输出、breadcrumb↔plan 漂移检测
      (utils/plan-sync.ts + check.ts)、handoff 追加 next (agent.ts:162) 均已实现。
    - P2.1：governance/decisions.ts 已存在；§5.3 docs-index 的 context --max-tokens
      任务相关性打分、reveal --level/--topic 子集均已实现。
    - P3：install --target codex|claude|opencode|universal 已实现。
  git 历史中的 P0/P1/P2 提交印证了这一点。

  剩余真实缺口集中在三处，本任务一次性收口：
    1. G1 程序化生命周期绑定（最大缺口）：src/hooks/lifecycle.ts 事件系统已存在但
       未接入 agent 命令——agent enter/done 不写/清 pending-done.md 哨兵，status/next
       也不检测。AI 仍可能静默遗忘 agent done，使状态永远停留在 executing。
    2. G8 journal→learn 管线（薄切片）：learn.ts 已能读取 journal 并通过
       uniquePatterns/lessonKey 去重写入 style/architecture，仅缺显式
       --from-journal/--recent N 入口与 --dry-run 预览。
    3. §5.3 docs-index（验证项）：context --max-tokens 与 reveal level/topic 均已实现，
       本任务仅补测验证，不重复造轮子。

functional_requirements:
  - id: FR-1
    description: "agent enter 写入 .docpath/workspace/pending-done.md 哨兵，内容含 task_id、entered_at(ISO 时间戳)、phase。复用 lifecycle.ts 的 emit('task_start') 接入，不另起一套。"
  - id: FR-2
    description: "agent done 在 finalStatus=done 时删除 pending-done.md（经 emit('task_end')）；blocked/skipped 时保留哨兵以便下次提醒。"
  - id: FR-3
    description: "status --agent 与 next --agent 检测到 pending-done.md 存在且 phase 仍为 executing 时，输出警告并将『完成当前任务 (docpath agent done)』作为高优先级 recommended_command。"
  - id: FR-4
    description: "pending-done.md 的 entered_at 超过 24h 时，status/next 触发 breadcrumb 自动追加一行 `[WARN] Task <id> active >24h without done`，每个哨兵仅追加一次（用哨兵内 warned 标记位去重），避免重复刷屏。"
  - id: FR-5
    description: "learn 命令新增 --from-journal[=N] 标志：显式从最近 N 条 journal entries 提取 lessons（默认 N 全部，沿用现有 journal 读取逻辑），与现有 lesson-candidates 入口互补。"
  - id: FR-6
    description: "learn 命令新增 --dry-run 标志：打印将合并到 style.md/architecture.md 的 lessons 及去重后结果，但不写任何文件。"
  - id: FR-7
    description: "（验证项，非新建功能）补充 context --max-tokens 任务相关性优先、reveal --level/--topic 子集的单元/e2e 测试，确认 §5.3 验收标准已满足；若测试暴露缺口则就地修复。"

constraints:
  - "复用现有 lifecycle.ts 事件系统（emit/on）实现哨兵写入与清理，可在 agent enter/done 接入 emit('task_start'/'task_end')；不新建并行机制。"
  - "不破坏 agent done 现有 check→review→journal→next 闭环，哨兵逻辑作为旁路副作用，失败不应阻断主流程。"
  - "learn --dry-run 必须复用与实写完全相同的去重结果(uniquePatterns)，保证预览与实写一致。"
  - "禁止手工写 state.json/current.md 的 phase/gate；所有状态变更仍走 transitionWorkflow/runtime。"
  - "不重复实现 docs-index：context/reveal 已具备能力，FR-7 仅做验证与补测。"
  - "向后兼容旧项目：缺少 pending-done.md 时所有命令必须正常工作（无报错、无误报）。"

acceptance_criteria:
  - "AI 忘记 agent done 时，下次 status --agent 或 next --agent 会提醒并推荐 docpath agent done。"
  - "agent done 成功后 pending-done.md 被自动清理；已 done 的任务不再被提醒（零误报）。"
  - "pending-done.md 存在超过 24h 时，breadcrumb 出现且仅出现一次 [WARN] active >24h 记录。"
  - "learn --from-journal 能从最近 journal 提取结构化 lessons 并合并到 style.md，重复 lesson 被去重。"
  - "learn --dry-run 输出待合并 lessons 但不修改 style.md/architecture.md（运行后 git diff 为空）。"
  - "context --max-tokens 在预算内优先保留当前任务相关文档；reveal --level N --topic X 输出对应子集；二者均有测试覆盖。"
  - "pnpm run typecheck 与 pnpm test 全绿。"
  - "/tmp 冒烟项目链路通过：init → agent enter(生成哨兵) → status(提醒) → agent done(清理哨兵)。"

out_of_scope:
  - "重写已实现的 P0/P1（phase/gate、transitionWorkflow、policy、drift、handoff）。"
  - "新建 docs-index 能力（已存在，仅验证）。"
  - "多 Agent install 适配的进一步扩展（P3 已满足当前验收）。"
