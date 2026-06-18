# 执行计划 — next-phase 路线图尾部收口

> 来源: `.docpath/tasks/current/spec.md`
> Level: 2 · 共 7 个子任务
> 说明: `docpath write-plan` 未实现，本文件由 brainstorm→plan 流程直接写入 canonical 路径。
> 推进方式: `docpath agent step --step "SN"`（按 SN id 引用，自动勾选下方 checklist）。

## 执行计划

- [ ] **S1**: 哨兵读写模块 pending-done.ts
  - **描述**: 新增 `src/utils/pending-done.ts`，定义哨兵 schema `{ task_id, entered_at(ISO), phase, warned? }`，提供 `writePendingDone` / `readPendingDone` / `clearPendingDone` / `markWarned`。落盘到 `.docpath/workspace/pending-done.md`。
  - **验收条件**: 单测覆盖写/读/清/markWarned 全路径；文件缺失时 `readPendingDone` 返回 `null` 不抛错（向后兼容旧项目）。
  - **依赖**: 无
  - **覆盖**: FR-1（基础设施）

- [ ] **S2**: lifecycle 接入 + agent enter/done 写清哨兵
  - **描述**: 在 `src/hooks/lifecycle.ts` 注册 `task_start`→`writePendingDone`、`task_end`→（仅 finalStatus=done 时）`clearPendingDone` 处理器；`agent enter` 调 `emit('task_start')`，`agent done` 在 finalStatus=done 时 `emit('task_end')`。blocked/skipped 不清哨兵。哨兵副作用包 try/catch，失败不阻断主闭环。
  - **验收条件**: `agent enter` 后哨兵存在；`agent done`(done) 后哨兵被删；blocked/skipped 后保留。不破坏现有 check→review→journal→next 闭环。
  - **依赖**: S1
  - **覆盖**: FR-1, FR-2

- [ ] **S3**: status/next --agent 检测哨兵并提醒
  - **描述**: 在 `src/utils/agent-output.ts` 的输出生成逻辑中，检测 pending-done.md 存在且 `phase === 'executing'` 时，输出警告并将 `docpath agent done` 设为高优先级 `recommended_command`。
  - **验收条件**: 构造 executing+哨兵状态 → `status --agent` / `next --agent` 输出提醒并推荐 `agent done`；无哨兵或 phase≠executing 时不提醒（零误报）。
  - **依赖**: S1
  - **覆盖**: FR-3

- [ ] **S4**: 24h 超时 breadcrumb 警告
  - **描述**: 在 S3 的检测点扩展：若 `entered_at` 距今超过 24h 且 `warned !== true`，向 breadcrumb 追加一行 `[WARN] Task <id> active >24h without done`，随后 `markWarned(true)`。
  - **验收条件**: 模拟 `entered_at` 为 25h 前 → breadcrumb 出现且仅出现一次 `[WARN]`；再次运行不重复追加。
  - **依赖**: S1, S3
  - **覆盖**: FR-4

- [ ] **S5**: learn --from-journal + --dry-run
  - **描述**: `learn` 命令新增 `--from-journal[=N]`（显式从最近 N 条 journal entries 提取，默认全部）与 `--dry-run`（复用现有 `uniquePatterns` 打印将合并的 lessons 及去重结果，不写文件）；在 `src/commands/register.ts` 注册两个 flag。
  - **验收条件**: `learn --dry-run` 运行后 `git diff` 为空（style.md/architecture.md 未变）；`--from-journal` 能提取并去重；--dry-run 预览结果与实写完全一致。
  - **依赖**: 无
  - **覆盖**: FR-5, FR-6

- [ ] **S6**: docs-index 验证补测（context/reveal）
  - **描述**: 为 `context --max-tokens` 任务相关性优先打分、`reveal --level/--topic` 子集过滤补单元/e2e 测试，确认 §5.3 验收已满足；若测试暴露缺口则就地修复（不重建已有能力）。
  - **验收条件**: 测试通过，覆盖「预算内优先保留当前任务相关文档」与「level N + topic X 子集输出」两条路径。
  - **依赖**: 无
  - **覆盖**: FR-7

- [ ] **S7**: 集成冒烟 + 全量门禁
  - **描述**: 在 `/tmp` 冒烟项目验证链路 `init → agent enter(生成哨兵) → status(提醒) → agent done(清理哨兵)`；运行 `pnpm run typecheck` 与 `pnpm test`。
  - **验收条件**: 冒烟链路全通；typecheck 与 test 全绿。
  - **依赖**: S2, S3, S4, S5, S6
  - **覆盖**: 全部验收标准闭环

## 依赖关系图

```
S1 → S2 ─────────────┐
S1 → S3 → S4 ────────┤
S5 ──────────────────┼→ S7
S6 ──────────────────┘
```

并行机会: S5、S6 与 S1→S4 链完全独立，可并行推进。
