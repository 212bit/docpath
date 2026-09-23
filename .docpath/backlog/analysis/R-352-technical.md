# R-352 技术方案：归档盲区补全

## 1. 改造点定位（全部落地名/行）

### 1.1 dropped 自动归档 —— src/engine/backlog.ts:445 refreshBacklogIndex
现在只 filter `done`。改为对 `dropped` 也走同一归档 rename（`status=done||dropped → archived/`），
复用既有撞号安全阀（R-321/FR-2：`!existsSync(targetPath)` 才 rename，非破坏性）。

```ts
const terminalItems = items.filter((i) => i.status === 'done' || i.status === 'dropped');
```
归档目标沿用 `archivedBacklogDir`（`.docpath/backlog/archived/`），满足验收「在 archived/ 找到」。

### 1.2 新 CLI 动作 `docpath archive <id>` —— src/commands/backlog.ts
promote 分支（:1297 case 'promote'）旁新增 `case 'archive'`：
- 校验条目存在且 status 为终态（done/dropped）或显式 force；
- 单文件/多文档 rename 到 archived/（复用 1.1 的 rename 安全阀）；非终态给提示，不静默。

### 1.3 promote 去重钩子 —— src/commands/backlog.ts:283-287 门禁前
promote 前扫描 `.docpath/backlog/` 是否存在**同 id**（撞号，R-321/FR-2 return 已实现）或
**同 title 已归档副本**（重复登记探测，复用 detectBacklogIdCollisions）。命中则：
- 输出「重复登记」提示 + 建议 merge/skip，要求显式 `--user-confirmed <text>` 才放行；
- 记录证据到条目 evidence.decision_brief。

## 2. 非破坏性纪律
- 所有 rename 先 `!existsSync(targetPath)`（沿用 R-321/FR-2 注释约束，禁止覆盖）。
- 真 id 重分配走独立迁移条目，不在 promote/archive 里自动改数据。
- dropped → archived 后仍可复活（状态机 dropped:['proposed']，L64-72）。

## 3. 验收映射
| 验收 | 落点 |
|------|------|
| dropped 存档后在 archived/ 找到 | 1.1 + 1.2 rename 链 |
| 重复登记有提示并记录证据 | 1.3 evidence.decision_brief |
| 门禁检查通过 maturity level2 | backlog edit --evidence-analysis/--spec 挂好 |

## 4. 边界与风险
- 语义级判重不做（防误并）：只做同 id 撞号 + 同 title 存档副本。
- CLI archive 对 active/proposed 非终态默认拒绝，需 --force + 用户确认。
