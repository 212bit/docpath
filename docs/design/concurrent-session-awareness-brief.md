# Decision Brief: 并发会话感知（R-231 收敛切片）

> 状态：**已确认**（user-confirmed，pre-implementation）
> 范围：`docpath next` / `docpath status` / `docpath agent enter` 的并发会话可见性
> 相关：R-231（"P1: 易用性优化 - 降低学习曲线和改进用户体验"）；
> 一次真实漂移事件——某会话据 `next --agent` 规划收尾时，另一并发会话已整体推进状态
> （任务切换 + 归档），`next --agent` 毫无提示。

## 背景

DocPath 已有完整的并发基础设施：

- **会话登记**：`touchSession`（src/utils/session.ts）在
  `.docpath/workspace/sessions/<sessionId>.json` 写 pid/cwd/command/task_id/updated_at。
- **任务/步骤租约**：`acquireExecutionLease` 对同一 task/step 的并发推进抛
  `LeaseConflictError`（fail-loud，4h TTL + stale 判定）。
- **状态互斥**：`withLock`（src/utils/lock.ts）保护 RMW。
- **会话枚举**：`dashboard.ts:667` 已 `readdir(sessionsPath)` 枚举会话。

缺口在**只读 advisory 面**：`next.ts` / `status.ts` **完全没有** session/stale/
concurrent/freshness 任何引用——它们是纯快照。租约只在**同任务**并发**推进**时 fail-loud，
对两类场景零保护：

1. 只读 advisory 读到陈旧快照，无告警。
2. 并发会话推进的是**另一个**任务——不触发同任务租约冲突，仍据陈旧快照规划。

本次事件正是路径 2。

## 方案（已确认 full slice）

### 1. 共享助手 `listActiveSessions`

新增 `src/utils/session.ts` 导出 `listActiveSessions(cwd, { excludeSelf, selfSessionId })`：
复用 `dashboard.ts` 的 readdir 模式，读取 sessions 目录，过滤 stale 记录（复用
`isLeaseStale` 的 TTL 逻辑 + `lock.ts` 的 `isProcessAlive` PID 探测）。返回
`SessionRecord[]`。dashboard 可后续复用，但本切片不强制重构。

### 2. `next --agent` / `status --agent` append-only 新增字段

YAML 输出新增（无并发时 `active_sessions: []`，向后兼容）：

- `active_sessions:` —— 除自身外的活跃会话列表（session_id、pid、task_id、command、
  updated_at 相对时间）。
- `concurrent_session_warning:` —— 非空时的可读提示。
- `state_freshness:` —— 状态文件 mtime + 最近改动会话（从最近 breadcrumb/lease 推断；
  若不可靠则仅给 mtime）。

### 3. `agent enter` 非阻塞告警

登记自身后，若 `listActiveSessions` 发现其它活跃会话，打印一行 `⚠️`（不阻塞、不 fail）。

## 备选方案

| # | 方案 | 取舍 | 结论 |
|---|------|------|------|
| A | advisory 告警（本方案） | 保持只读非阻塞，符合 `next` 语义 | **采纳** |
| B | 新增阻塞式读锁 | 改变 `next` 非阻塞语义，与 advisory 定位冲突 | 否决 |
| C | 仅同任务租约扩展到只读 | 不覆盖"并发推进另一任务"的本次场景 | 否决 |
| D | 最小切片（去掉 state_freshness） | 更小但用户选 full slice | 否决（备回退项） |

## 影响 / 边界

- **数据契约**：`--agent` YAML **append-only** 新增字段；现有 `changes`/`check` 等解析器
  不受影响（新字段忽略即可）。需测试回归。
- **行为边界**：只在当前 workspace sessions 目录范围，不做跨 worktree 聚合；
  不改租约/锁的 fail-loud 语义；不引入自动重读/重试循环——只告警，由 Agent 决策。
- **stale 判定**：复用现有 TTL + PID 存活逻辑，避免双套判据。

## 回滚

- 新字段为 append-only，回滚即移除 `active_sessions`/`concurrent_session_warning`/
  `state_freshness` 渲染与 `listActiveSessions` 调用；助手保留无副作用。
- `agent enter` 告警为单行 `console.warn`，移除即恢复静默。

## 验收（与 R-231 一致）

- `listActiveSessions` 助手导出，过滤 stale。
- `next`/`status --agent` 无并发时 `active_sessions: []`；有并发时输出非空列表 + warning。
- `agent enter` 检测到并发会话时非阻塞告警。
- 单元测试覆盖无并发/有并发/stale 三场景，100% 通过。
- `--agent` 字段 append-only，现有解析器不破。
