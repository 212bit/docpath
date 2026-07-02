## 执行计划

### S1: 梳理 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测）
- [x] S1: 梳理 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测）
- **描述**: 根据 spec 明确 FR-1: 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测） 的实现边界和验收口径。
- **验收条件**: AC-1: `listActiveSessions` 助手导出，过滤 stale（超 TTL 或 PID 不存活）的会话记录
- **依赖**: 无

### S2: 实现 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测）
- [x] S2: 实现 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测）
- **描述**: 在现有架构内完成 FR-1: 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测） 的代码与文档更新。
- **验收条件**: FR-1 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测） 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `next --agent` / `status --agent` YAML append-only 新增 `active_sessions`、`concurrent_session_warning`、`state_freshness` 字段；无并发时 `active_sessions: []`
- [x] S3: 实现 FR-2 `next --agent` / `status --agent` YAML append-only 新增 `active_sessions`、`concurrent_session_warning`、`state_freshness` 字段；无并发时 `active_sessions: []`
- **描述**: 在现有架构内完成 FR-2: `next --agent` / `status --agent` YAML append-only 新增 `active_sessions`、`concurrent_session_warning`、`state_freshness` 字段；无并发时 `active_sessions: []`。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `agent enter` 在登记自身后，若发现其它活跃会话，打印非阻塞 `⚠️` 告警
- [x] S4: 实现 FR-3 `agent enter` 在登记自身后，若发现其它活跃会话，打印非阻塞 `⚠️` 告警
- **描述**: 在现有架构内完成 FR-3: `agent enter` 在登记自身后，若发现其它活跃会话，打印非阻塞 `⚠️` 告警。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 验证验收标准
- [x] S5: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: `listActiveSessions` 助手导出，过滤 stale（超 TTL 或 PID 不存活）的会话记录；AC-2: `next --agent` / `status --agent` 无并发时输出 `active_sessions: []`（append-only，向后兼容）；AC-3: 存在其它活跃会话时输出非空 `active_sessions` 与 `concurrent_session_warning`，不影响现有字段解析；AC-4: `agent enter` 检测到其它活跃会话时打印非阻塞告警；AC-5: 单元测试覆盖无并发/有并发/stale 过滤三场景，100% 通过；AC-6: `--agent` YAML 字段 append-only，现有 changes/check 等解析器回归不破；AC-7: backlog 条目 R-231 与任务 T-20260630-p1 建立双向关联
- **验收条件**: AC-1: `listActiveSessions` 助手导出，过滤 stale（超 TTL 或 PID 不存活）的会话记录；AC-2: `next --agent` / `status --agent` 无并发时输出 `active_sessions: []`（append-only，向后兼容）；AC-3: 存在其它活跃会话时输出非空 `active_sessions` 与 `concurrent_session_warning`，不影响现有字段解析；AC-4: `agent enter` 检测到其它活跃会话时打印非阻塞告警；AC-5: 单元测试覆盖无并发/有并发/stale 过滤三场景，100% 通过；AC-6: `--agent` YAML 字段 append-only，现有 changes/check 等解析器回归不破；AC-7: backlog 条目 R-231 与任务 T-20260630-p1 建立双向关联
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [ ] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
