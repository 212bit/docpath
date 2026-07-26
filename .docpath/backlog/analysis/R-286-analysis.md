# R-286 Analysis — 状态写入锁下沉: mutateCurrentState 唯一变更入口

> 来源: 2026-07-26 全量架构 review（会话内深读 + git churn/backlog 实证）。

## 1. 问题清单（8 处无锁旁路，全部为 read-modify-write）

withLock 互斥目前只存在于 transitionWorkflow（src/engine/transitions.ts:262，锁文件 workspace/state.lock）。以下调用点全部绕过 FSM 直接调用不加锁的 writeCurrentState（src/utils/workspace.ts:116），且写入值均由「早先读取的 state 展开修改」构成：

| # | 位置 | 语义 | 竞态特征 |
|---|------|------|----------|
| 1 | src/commands/go.ts:278 | profile 自动升级（{...current, workflow_profile, level, updated_at}） | 读于函数入口，写于多步校验后，窗口长 |
| 2 | src/commands/check.ts:146 | quick→standard 升级（改 level/profile + 后续重写 spec.md） | 同上，且与门禁副作用叠加 |
| 3 | src/commands/quick.ts:168 | transitionWorkflow('step.started') 出锁后立即覆写 patch level/profile/current_step | FSM 结果被无锁覆写，最典型 |
| 4 | src/commands/agent.ts:231 | backlog_id 回填（{...current, backlog_id} ） | 读写间隔短但仍是 RMW |
| 5 | src/commands/task.ts:36 | 任务态写入 | 待迁移时按上下文核对 |
| 6 | src/commands/init.ts:184 | 初始化状态写入 | 非 RMW（全新状态），但入口应统一 |
| 7 | src/commands/init.ts:376 | 同上 | 同上 |
| 8 | src/commands/worktree.ts:339 | 向新 worktree 路径写初始状态 | 锁按路径隔离，风险低，入口应统一 |

历史：26cd064 引入 withLock 修复并发 Agent lost update，但只覆盖 FSM 路径；上述旁路保持裸写。

## 2. 方案

### 2.1 核心：唯一变更入口

在 src/utils/workspace.ts 新增：

```ts
export async function mutateCurrentState(
  cwd: string,
  mutator: (previous: CurrentState | null) => CurrentState | Promise<CurrentState>,
): Promise<CurrentState>
```

内部：withLock(stateLockPath(cwd)) → readCurrentState → mutator(previous) → writeCurrentState → 返回写入后的状态。调用方必须在 mutator 内基于 previous 重算增量（而非闭包捕获的陈旧 state），并以返回值刷新本地变量。

### 2.2 锁标识单源

新增 stateLockPath(cwd) 导出（workspace/state.lock），transitions.ts 改用同一 helper，保证两条路径互斥于同一把锁。

### 2.3 重入约束

withLock 不可重入（同 lockPath 嵌套将自旋至超时）。约定：
- transitionWorkflow 持锁段内继续使用 read/write 原语，不得调用 mutateCurrentState；
- mutator 内不得调用 transitionWorkflow 或再次 mutateCurrentState；
- writeCurrentState 保持导出（engine 层需要），但 src/commands、src/hooks 禁止直接导入——以测试层 grep 断言固化边界。

### 2.4 逐点迁移策略

- go.ts / check.ts / agent.ts / task.ts：机械改写为 mutateCurrentState，mutator 内用 previous 重算；写后以返回值更新局部 current。
- quick.ts：优先消灭二次写——step.started 的 TransitionPayload 已支持 level/workflowProfile/currentStep（transitions.ts:297-306），把 patch 内容并入 payload，一次带锁转移完成；若上下文有阻碍再退回 mutateCurrentState。
- init.ts / worktree.ts：mutator 忽略 previous 返回全新状态（() => freshState），统一入口。

### 2.5 明确不做

- mutateCurrentState 不自动刷 updated_at（各调用点语义不同，保持现状由 mutator 决定）；
- 不在 mutateCurrentState 内做 agent snapshot 刷新（保持与现有直写行为一致，避免行为面扩大）；
- 不动 FSM 事件表与门禁语义。

## 3. 测试策略

- 并发回归：同一 workspace 上 N 个并发 mutateCurrentState 各自 level+1（或等价可计数字段），断言无 lost update（最终值 = N）。
- 边界断言：扫描 src/commands、src/hooks 源码，断言不存在 writeCurrentState 导入。
- 现有全量测试回归（含 FSM/lifecycle 套件），确认 transitionWorkflow 无重入死锁。
- 构建注意：tests 经 ../dist 导入，src/utils/workspace.ts 需加入 tsup CLI_ENTRY（既有 footgun，见 rules）。

## 4. 风险与回滚

- 风险：锁竞争增加（默认 5s 超时）——各写入均为毫秒级，低风险；迁移遗漏某调用点——grep 断言兜底。
- 回滚：mutateCurrentState 为增量入口，逐点迁移可独立 revert；整任务可整体回滚提交。
