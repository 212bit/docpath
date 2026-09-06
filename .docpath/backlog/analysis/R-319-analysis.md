# R-319 Analysis — trace 会话身份与隔离子系统背离（`getSessionId` 独立 env 链，无视 `--session`）

## Problem

`.docpath/workspace/trace.jsonl` 实测本工作区 `session` 键恒为 `session-default`。backlog 初稿把它归因为"P0 会话隔离失效 → `next`/`status` 返回错误 current task → 逼出 14.3% 重复确认 turn"。经实现前取证（AC 验证纪律，承 R-318 教训），该因果链**不成立**，但**存在一个真实且可修的缺陷**：遥测层与隔离层的"会话身份"是两套互不一致的来源。

## 前提证伪（必须先记录，防止再次按错误假设立项）

1. **`next`/`status` 不消费 session 键**：当前任务解析走 `readCurrentState(state.json)`（按 cwd 全局），见 `src/utils/agent-output.ts` 组装 `active_sessions`/`concurrent_session_warning` 时 session 仅用于并发告警、不用于选任务。→ "session-default 导致返回错任务"无代码路径支撑。
2. **隔离是 opt-in、default 合法**：`verifySessionCwd` 在 `sessionId === DEFAULT_SESSION_ID` 时直接 return（`src/utils/session.ts:109`）；CLAUDE.md/CODEX.md 明写"设 session 可选，单 agent 顺序开发用普通流程"。本 harness 未导出任何会话 env（实测 `env | grep SESSION` 为空）→ `session-default` 是顺序使用的预期态。
3. **14.3% 重复 `next` 是 agent 协议行为**（rule：start/resume 必跑 next + 复核），与会话键无关。原成本模型把该 turn 归因给会话机制属**臆测**。

→ 结论：原 P0 定级与 turn 成本理由**予以撤销**。

## Root Cause（真缺陷，已定位到代码）

DocPath 有**两个会话身份来源**，彼此背离：

- 隔离子系统单一真源：`resolveSessionContext(explicit)`（`src/utils/session.ts:42`）= `--session 选项 || DOCPATH_SESSION || 'default'`（默认串 `'default'`，`DEFAULT_SESSION_ID` L10）。
- 遥测私有旁路：`getSessionId()`（`src/utils/trace.ts:65`）= `CLAUDE_SESSION || CODEX_SESSION || OPENCODE_SESSION || DOCPATH_SESSION || 'session-default'`（默认串 `'session-default'`）。

`getSessionId()` 仅被 trace.ts 内部两处调用（L103 `writeTraceEntry`、L209 `writeTraceEntrySync`），无任何外部引用。三处背离：

1. **无视 `--session`**：`index.ts:118` 解析出 `sessionOption` 并 `resolveSessionContext(sessionOption)`（L119）用于 `verifySessionCwd`，但**该 sessionId 从不透传给 trace 写入**（`index.ts:128-145` 的 `writeTraceBeforeExit` 调 `writeTraceEntrySync` 时不带 session）。故用 `--session foo` 隔离时，运行时是 `foo`、trace 仍记 `DOCPATH_SESSION` 或 `session-default` → 遥测与真实隔离桶背离。
2. **默认串不同**：`'session-default'`（trace）vs `'default'`（隔离）→ trace 无法与 `sessions/<id>.json` 关联。
3. **旁路 env 链**：trace 读 `CLAUDE_SESSION` 等而隔离不读 → 两子系统对"同一命令属于哪个会话"判定不一致。

后果：无人显式设会话时 `groupBySession` 把所有命令塌进一个桶，`docpath trace session/health/anomaly` 的按会话分析与 `loop-next` 异常检测失真（分不清"单 agent 在 next 环打转"与"多 agent 同 cwd 对撞"）。

## Expected Behavior

trace 的 `session` 字段应**等于**隔离子系统实际使用的会话身份：
- 复用 `resolveSessionContext()` 作为**单一真源**；
- `index.ts` 把 `--session` 解析结果透传给 trace 写入，使 `--session foo` 时 trace 也记 `foo`；
- 统一默认标识（不再出现与隔离层拼写不一致的私有串）。
- Agent 平台归属仍由 `detectAgent()` 单独记录（`session` 字段不再兼职承载 `CLAUDE_SESSION` 等启发式）。

## Scope

### In scope
- `src/utils/trace.ts`：删除私有 `getSessionId()` env 旁路；`writeTraceEntry`/`writeTraceEntrySync` 的 session 字段改为来自 `resolveSessionContext`（新增可选 `sessionId` 入参，缺省时自解析）。
- `src/index.ts`：把 L118-119 已解析的 `sessionId` 透传给 `writeTraceEntrySync`（经 `writeTraceBeforeExit` 闭包）。
- 回归测试：证明 (a) `--session X` 时 trace `session===X`；(b) 无 session 时 trace 默认标识与 `resolveSessionContext().sessionId` 逐字一致。

### Out of scope
- **不改隔离语义**：不让 `resolveSessionContext` 新增读取 `CLAUDE_SESSION` 等（那会让 `verifySessionCwd` 对存量用户开始抛跨目录错，回归面过宽 = 方案 B，用户已否决）。
- 不改 `next`/`status` 任务解析（本就与 session 无关，无可修）。
- 不在本任务做 R-320（next 去重），也不重开 R-318。
- 不改 trace 轮转/其他字段。

## Technical Surface
- 真源：`src/utils/trace.ts:65-73`（getSessionId）、`L103`、`L182-209`（sync 写入）。
- 接缝：`src/index.ts:118-121`（sessionOption 解析，未透传）、`L128-145`（trace 写入闭包）。
- 隔离侧：`src/utils/session.ts:42-48`（resolveSessionContext）、`L10 DEFAULT_SESSION_ID`、`L109`（default 短路）。
- 消费侧不受影响：`src/utils/agent-output.ts`（session 仅用于并发告警）。
- 测试：`tests/runtime-state.test.mjs:174-193`（trace 仅测轮转，不测 session 值，故改动低风险）；新增断言建议入此文件或新建 `tests/trace-session.test.mjs`。

## Decision Brief（P2；promote 后写入 spec）

- **问题**：trace 会话身份与隔离子系统背离（无视 `--session`、默认串不一致），使按会话的可观测性/分析在设了会话时仍失真。
- **选项**：
  - **A（选定）**：`getSessionId` 私有 env 旁路删除，trace 复用 `resolveSessionContext` 为单一真源，并透传 `--session`。改动局限遥测写入路径，**隔离行为零变化**、回归面小。
  - B：进一步让 `resolveSessionContext` 也读 `CLAUDE_SESSION` 等作回落 → 平台会话可驱动真实隔离，但改变隔离强制语义、可能触发存量 `verifySessionCwd` 抛错，回归面大。**（用户否决）**
  - C：仅统一默认串、不处理 `--session` 透传 → 半修，旁路 env 链仍在，`--session` 场景仍失真。
- **选择理由**：A 直击"单一真源"，零隔离风险，符合"小而真"边界。B 越界到隔离语义（R-318 式过度放宽的翻版），C 治标。
- **风险**：A 移除 trace 对 `CLAUDE_SESSION` 的读取 → 曾依赖该字段做平台归类的下游会变化；缓解：`agent` 字段仍由 `detectAgent()` 独立给出平台归属，`session` 字段职责收敛为"隔离会话身份"。
- **回滚**：还原 `getSessionId` + trace 写入行即可。

## Acceptance Criteria
- [ ] AC-1: `--session <id>` 执行任一 trace 命令时，`trace.jsonl` 该条 `session === <id>`（透传生效）。
- [ ] AC-2: 无 `--session`/无 env 时，trace `session` 值与 `resolveSessionContext().sessionId` **逐字一致**（默认串不再分叉）。
- [ ] AC-3: 隔离行为零变化：`verifySessionCwd`/锁/`touchSession` 路径不受影响（无新增跨目录抛错）。
- [ ] AC-4: 全量测试 + typecheck 通过；新增回归覆盖 AC-1/AC-2。
- [ ] AC-5: backlog R-319 定级与标题反映**重塑后的真实范围**（P2 / 遥测一致性），不再含被证伪的 turn 成本表述。

## Evidence References
- 代码：`src/utils/trace.ts:65-73,103,182-209`、`src/index.ts:118-145`、`src/utils/session.ts:10,42-48,109`、`src/utils/agent-output.ts`（并发告警用 session、非选任务）。
- 环境实测：本 harness `env | grep SESSION` 为空；trace `session` 恒 `session-default`。
- 无外部引用：`getSessionId` 仅 trace.ts 内部两处；无测试断言其值（`rg getSessionId tests` 为空）。
- 关联：R-318（同批 P0，已证伪关闭）、R-320（next 去重，待同样 FR-4 验尸）。
