# R-352 需求分析：归档盲区与重复登记模式

## 1. 现状取证（agent 实测，非臆想）

### 1.1 只有 done 自动归档 → 证据
`src/engine/backlog.ts:445-458 refreshBacklogIndex`：

```ts
const doneItems = items.filter((item) => item.status === 'done');
// (...) 只有 done 走 rename → .docpath/backlog/archived/
```

- 归档分支**只看 `status === 'done'`**，filter 后没有任何对 `dropped` 的处理。
- 结论：`dropped` 条目**没有自动归档路径**（用户原话「这 5 条只能手工 mv」属实）。

### 1.2 CLI 动作集里没有 archive → 证据
`docpath backlog --help` 的动作集：# 实际动作 = add / edit / list / promote / cli 用到的 promote 只有 promote 一个推进动作（backlog.ts:1297 case 'promote'）。无 `archive` 动作、无 `remove` 做终态归档。用户原话「CLI 动作集里也没有 archive」属实。

### 1.3 重复登记已成模式 → 证据（第 3 例在回归路径上确认）
用户举的 3 例：R-058/R-059（半开扫描同一需求两套任务）、R-061（两个任务目录 T-20260922+T-20260923）、R-064（与 R-059 同名）。共同成因：多会话并行，一个会话把别人已合并的成果当待办重走一遍。

> 注：这 3 例的原始条目在**使用方项目**（非本仓库）。本仓库自查也命中同类：backlog.md 里 R-352 是第 2 条以「archiving/blind-spots」为题的条目（R-318/FR 系 + R-352 双登记）。

## 2. 需求边界（不回填引擎，只做协议层修正）

用户本次要求的核心是**协议/CLI 能力补全**，不是引擎架构返工：

| # | 能力 | 归属层次 |
|---|------|---------|
| 1 | `dropped` 条目自动归档路径（归档后可在 done/ 或 archived/ 找到） | 引擎归档链 |
| 2 | 新增 CLI 动作 `docpath archive <id>` | CLI 动作集 |
| 3 | promote 阶段去重：同名/同内容任务提示合并或 skip | promote 门禁 |

## 3. 验收（对齐 R-352 正文「验收」）
- dropped 条目归档后能在 `.docpath/backlog/archived/` 找到。
- 重复登记时有明确提示并记录证据（撞号安全阀非破坏性，R-321/FR-2 惯例）。
- 门禁检查通过（level 2 maturity）。

## 4. 非目标（显式排除，防越界）
- 不重写 done 归档链（已工作）。
- 不做「同内容但不同语义」的语义级判重——那超出机械门禁能力，会误并。只在**同名/同 ID 撞号**层面去重提示。
