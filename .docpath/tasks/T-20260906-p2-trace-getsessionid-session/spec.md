# T-20260906-p2-trace-getsessionid-session - P2: 统一 trace 会话身份到隔离真源（getSessionId 复用 resolveSessionContext 并透传 --session）

> backlog_id: R-319
> backlog_source: docpath backlog add

## 1. 背景与动机

trace 记录里的 `session` 字段与 DocPath 会话隔离子系统使用**两套不一致的会话身份来源**，导致按会话的可观测性/分析失真：

- 隔离真源 `resolveSessionContext()`（`src/utils/session.ts:42`）：`--session 选项 || DOCPATH_SESSION || 'default'`。
- 遥测旁路 `getSessionId()`（`src/utils/trace.ts:65`）：`CLAUDE_SESSION || CODEX_SESSION || OPENCODE_SESSION || DOCPATH_SESSION || 'session-default'`，且仅被 trace.ts 内部两处调用（L103、L209），无外部引用。

三处背离：(1) `index.ts:118` 解析出的 `--session` 值从不透传给 trace 写入（`index.ts:128-145`），用 `--session foo` 时 trace 仍不记 `foo`；(2) 默认串 `'session-default'` 与隔离层 `'default'` 不一致，无法与 `sessions/<id>.json` 关联；(3) 旁路 env 链读的变量与隔离层不同。后果：`groupBySession` 把命令塌进一个桶，`docpath trace session/health/anomaly` 与 `loop-next` 异常检测失去区分力。

**定级纠正（承 R-318 取证纪律）**：本条初稿曾定为 P0，理由"会话隔离失效 → next/status 返回错任务 → 14.3% 重复确认 turn"。经取证**不成立**——`next`/`status` 任务解析走全局 `state.json`、不消费 session 键；隔离是 opt-in、default 合法（`verifySessionCwd` 对 default 直接 return）。故降为 **P2**，范围收敛为"遥测与隔离会话身份一致性"，**不再声称省 turn**。完整取证见 `.docpath/backlog/analysis/R-319-analysis.md`。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-319-analysis.md

## 2. 需求清单

### 功能需求
- [ ] FR-1: 移除 `getSessionId()` 的私有 env 旁路，trace 的 `session` 字段改为来自 `resolveSessionContext()` 单一真源。
- [ ] FR-2: `index.ts` 将 `--session` 解析结果透传给 trace 写入（async 与 sync 两路径），使 `--session <id>` 时该条 trace `session === <id>`。
- [ ] FR-3: 无 `--session`/无 env 时，trace 默认标识与 `resolveSessionContext().sessionId` 逐字一致（消除 `'session-default'` vs `'default'` 分叉）。
- [ ] FR-4: `writeTraceEntry`/`writeTraceEntrySync` 增加可选 `sessionId` 入参并保持向后兼容（缺省时自解析）。

### 非功能需求
- [ ] NFR-1: 隔离行为零变化——不改 `resolveSessionContext` 语义、不新增读取 `CLAUDE_SESSION` 等到隔离路径（避免 `verifySessionCwd` 对存量用户新增跨目录抛错）。
- [ ] NFR-2: `detectAgent()` 继续独立记录 Agent 平台归属；平台信息不因其从 session 字段移除而丢失。
- [ ] NFR-3: 保持与现有 DocPath 工作流/测试兼容，零回归。

## 3. 范围界定

### 包含
- `src/utils/trace.ts`：`getSessionId` 收敛/删除，两处写入改用统一会话身份；新增可选 `sessionId` 入参。
- `src/index.ts`：把 `resolveSessionContext(sessionOption).sessionId` 透传到 trace 写入闭包。
- 回归测试：覆盖 `--session` 透传与默认串一致性（`tests/`）。

### 不包含
- 不改会话隔离/锁/`touchSession`/`verifySessionCwd` 的强制语义（方案 B，已否决）。
- 不改 `next`/`status` 任务解析（本就与 session 无关）。
- 不做 R-320（next 去重）、不重开 R-318。
- 不改 trace 轮转、其他字段、config schema。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 会话身份统一方式 | A 删旁路复用真源 / B 让隔离也读平台 env / C 只统一默认串 | A | A 零隔离风险、直击单一真源；B 越界改隔离语义回归面大（已否决）；C 半修 |
| 2 | `--session` 生效方式 | 透传 index 已解析值 / trace 自解析 | 透传 | index 已解析 sessionOption，透传最省且与 verifySessionCwd 同源 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 判定说明
本任务仅改遥测写入路径（`src/utils/trace.ts` + `src/index.ts` 的 trace 透传），**不触碰**工作流状态机、门禁、Agent 路由、权限/写边界、数据/API 契约、模块边界；改动文件均不在 `major-change.ts` 的战略文件模式内。隔离语义显式保持不变（NFR-1）。故不属重大变更。

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: trace `session` 字段与隔离子系统两套会话身份背离（无视 `--session`、默认串不一致），按会话可观测性失真。
- 目标: 让 trace 复用 `resolveSessionContext` 单一真源并透传 `--session`，隔离行为零变化。
- 可选方案:
  - 方案 A: 删 `getSessionId` env 旁路，trace 复用 `resolveSessionContext` + index 透传 `--session`（隔离零变化）。
  - 方案 B: 进一步让 `resolveSessionContext` 读 `CLAUDE_SESSION` 等 → 平台会话驱动真实隔离，但改变隔离强制语义、可能对存量用户触发 `verifySessionCwd` 抛错。
  - 方案 C: 仅统一默认串、不处理 `--session` 透传 → 半修，旁路仍在、`--session` 场景仍失真。
- 推荐方案: 方案 A
- 决策理由: A 直击单一真源、回归面最小；B 是 R-318 式过度放宽的翻版（越界改隔离语义）；C 治标不治本。
- 不做什么: 不改隔离/锁/verifySessionCwd 语义；不扩到 next/status 或 R-320。
- 成本: 低——两处 trace 写入 + 一处 index 透传 + 回归测试。
- 风险: 移除 trace 对 `CLAUDE_SESSION` 的读取会改变曾依赖该字段做平台归类的下游；缓解：`agent` 字段仍由 `detectAgent()` 独立给出，`session` 职责收敛为隔离会话身份。
- 回滚方案: 还原 `getSessionId` + 两处写入行 + index 透传即恢复现状。
- 用户确认: 已确认 —— 2026-09-07 会话内用户选择方案 A（"重塑为小而真的修复，统一 trace.getSessionId→resolveSessionContext，定级 P2，正常 promote→spec→实现"），批准进入实现。

## 5. 验收标准

- [ ] AC-1: `--session <id>` 执行任一被 trace 记录的命令时，`trace.jsonl` 该条 `session === <id>`（透传生效）。
- [ ] AC-2: 无 `--session` 且无 `DOCPATH_SESSION` 时，trace `session` 值与 `resolveSessionContext().sessionId` 逐字一致（默认串不再分叉为 `session-default`）。
- [ ] AC-3: 隔离行为零变化：`verifySessionCwd`/锁/`touchSession` 路径不受影响，`resolveSessionContext` 不新增读取平台 env。
- [ ] AC-4: `getSessionId()` 私有 env 旁路被移除或收敛为委托 `resolveSessionContext`；`detectAgent()` 仍独立记录平台。
- [ ] AC-5: 新增回归测试覆盖 AC-1/AC-2；`writeTraceEntry` 向后兼容（既有 `tests/runtime-state.test.mjs` trace 轮转用例不破）。
- [ ] AC-6: 全量测试与 typecheck 通过，零行为回归。
