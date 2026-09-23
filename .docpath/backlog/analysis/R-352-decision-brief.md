# R-352 决策记录（Decision Brief）—— 归档盲区补全方案

> 状态：待用户确认（confirmed 前不进入实现）
> 关联：task T-20260923-docpath-archiving-blind-spots-and-duplic
> 决策类型：architecture（新增 CLI 动作集成员 + 引擎归档链 + promote 门禁逻辑）

## 决策点
用哪条路径补 DocPath 的归档盲区与重复登记去重？

## 备选方案

### 方案 A：只补引擎自动归档（最小）✅ 建议
- dropped/done 统一自动归档：refreshBacklogIndex 的归档分支从只认 `done` 扩为 `done + dropped`，
  全部 rename 进 `.docpath/tasks/done/dropped-YYYYMMDD/` 前的归档区（沿用 R-321/FR-2 撞号安全阀：
  `!existsSync(targetPath)` 才 rename，非破坏性）。
- 对 docpath 自身零 CLI 改动，风险最小，直接修复「dropped 无自动路径」这一处盲区。
- 缺点：不提供显式 `archive` 动作；promote 去重提示是次要痛点，本次不强求。

### 方案 B：引擎自动归档 + CLI archive 动作（推荐）
- 在 A 基础上新增 CLI 动作 `docpath archive <id>`：显式把 dropped/done 条目推进归档，
  补上「CLI 动作集里没有 archive」的第二处盲区。
- promote 阶段加去重钩子：扫描同名/同内容已归档任务，命中时提示合并或 skip（保留证据）。
- 优点：把盲区与重复登记两类问题一次收全；动作集补全后与「promote 是唯一推进门」的
  FSM 自洽。
- 代价：CLI 动作集扩展（改 src/commands/backlog.ts + engine/backlog.ts 两处动作面 + 测试），
  属于 level 2 架构变更——需要你确认后按 plan → go 实现。

### 方案 C：只做重复登记去重提示（偏题）
- 只改 promote 去重，不碰归档链。dropped 盲区仍留，问题只修一半，不选。

## 影响面
| 维度 | 影响 |
|------|------|
| 归档链 | backlog.ts:445 done-only → done+dropped；新增 dropped-YYYYMMDD 归档目标 |
| CLI 动作集 | 新增 `docpath archive <id>` |
| promote 门禁 | 新增同名/同内容去重提示钩子 |
| 兼容性 | 不破坏已 done 归档路径；新动作可选不侵入现有流程 |
| 门禁 | 按 level 2 maturity，check/review 走正式通道 |

## 推荐结论
**方案 B**：一次修全两处盲区（dropped 自动归档 + CLI archive 动作），并给 promote 加去重提示。
与 R-352 四条 FR 完全对齐，改动集中在 backlog.ts 一个引擎文件 + 一个命令文件，边界清晰。

## 需要你拍板
1. 方案选 **B**（A/C 见上，若你要更小/更大范围请指明）？
2. 若确认 B：归档目标固定用 `.docpath/tasks/done/dropped-YYYYMMDD/`（沿用 spec 播种值）还是
   你更偏好 `.docpath/backlog/archived/`（与 backlog archived 同域）？
