# R-231 并发会话感知 - 分析汇总

## 概述

将 R-231（"P1: 易用性优化 - 降低学习曲线和改进用户体验"）这一原始占位条目
收敛为一个具体、可验收的最小切片：**让 `next`/`status` 的 `--agent` 输出在
存在其它活跃会话或状态已被并发改动时发出告警**，避免 Agent 基于陈旧快照规划。

本切片是对一次真实漂移事件的响应：一个会话读取 `next --agent` 后据其规划收尾，
期间另一个并发会话已把状态整体推进（任务切换 + 归档），`next --agent` 输出却
毫无提示，导致规划作废。

## 现状（已实现的并发基础设施）

- **会话登记**：`touchSession`（src/utils/session.ts）在
  `.docpath/workspace/sessions/<sessionId>.json` 写入 pid/cwd/command/task_id/updated_at。
  由 `go.ts`、`agent.ts`、`runtime.ts` 调用。
- **任务/步骤租约**：`acquireExecutionLease` 对同一 task/step 的并发推进抛
  `LeaseConflictError`（fail-loud），带 4h TTL 与 stale 判定。
- **状态互斥**：`withLock`（src/utils/lock.ts）用 `flag:'wx'` 原子创建 + 时间戳/PID
  stale 探测，保护 RMW；5s 超时后 fail-loud。
- **会话枚举**：`dashboard.ts:667` 已用 `readdir(sessionsPath)` 枚举会话；
  `workspace-cleanup.ts` 亦读 sessions 目录。**无共享的 `listActiveSessions` 助手。**

## 核心缺口（本切片要修的）

`next.ts` 与 `status.ts` **完全没有** session/stale/concurrent/freshness 任何引用：
它们是纯只读快照，既不报告其它活跃会话，也不报告"自你上次读取后状态已被改"。
租约只在**同任务**并发**推进**时 fail-loud，对以下两类场景零保护：

1. 只读 advisory（`next --agent`/`status --agent`）读到的是陈旧快照，无告警。
2. 并发会话推进的是**另一个**任务（如 A 收尾任务X，B 已切到任务Y）——不触发同任务
   租约冲突，A 仍据陈旧快照规划。

这正是本次事件的发生路径。

## 提议范围（最小可交付）

新增共享助手 `listActiveSessions(cwd, { excludeSelf })`（基于现有 readdir 模式，
带 stale/PID 存活过滤），在 `next --agent` 与 `status --agent` 的 YAML 输出中
append-only 新增字段：

- `active_sessions:` 列出除当前 session 外的活跃会话（session_id、pid、task_id、
  command、updated_at 相对时间）。
- `concurrent_session_warning:` 当 `active_sessions` 非空时给出一句人类可读提示
  （"检测到 N 个并发会话，状态可能已被改动，行动前请重新读取"）。
- `state_freshness:` 状态文件的 mtime + "last_modified_by_session"（若可从最近
  breadcrumb/lease 推断），供 Agent 判断快照新旧。

`agent enter` 在登记自身后，若发现已有其它活跃会话，打印一行 `⚠️` 提示（不阻塞）。

## 验收标准

- AC-1: `listActiveSessions` 助手存在并导出；对 stale（超 TTL 或 PID 不存活）的
  会话记录予以过滤。
- AC-2: `next --agent` / `status --agent` YAML 在无并发会话时输出
  `active_sessions: []`（保持向后兼容，append-only）。
- AC-3: 存在其它活跃会话时，输出非空 `active_sessions` 与
  `concurrent_session_warning`，且不影响现有字段解析。
- AC-4: `agent enter` 检测到其它活跃会话时打印非阻塞告警。
- AC-5: 单元测试覆盖：无并发、有并发、stale 会话被过滤三种场景，100% 通过。
- AC-6: `--agent` YAML 字段为 append-only，现有解析器（changes/check 等）不破。

## 不包含（Out of Scope）

- 不改变租约/锁的 fail-loud 语义；不新增阻塞式锁。
- 不做跨 worktree 的会话聚合（仅在当前 workspace sessions 目录范围）。
- 不做自动重读/重试循环——只告警，由 Agent 决策。
- 不重构 dashboard 现有会话枚举（可后续复用本助手，但不在本切片）。

## 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 触发面 | advisory 命令告警 / 新增阻塞锁 | advisory 告警 | 保持只读非阻塞，符合 `next` 语义 |
| 2 | 字段策略 | 新增字段 / 改现有字段 | append-only 新增 | 不破坏现有 `--agent` 解析器 |
| 3 | stale 判定 | 复用 lease TTL+PID / 新规则 | 复用现有 isLeaseStale/PID 逻辑 | 一致性，避免双套判据 |

## 必答问题（澄清）

- Q1: `state_freshness` 的"最近改动会话"是否可从 breadcrumb/lease 可靠推断？
  若不可靠，本切片是否只交付 `active_sessions` + `concurrent_session_warning`？
- Q2: 告警阈值——是否只对"非自身且非 stale"的会话告警（推荐：是）？
