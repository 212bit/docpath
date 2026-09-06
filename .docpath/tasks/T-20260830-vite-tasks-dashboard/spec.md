# T-20260830-vite-tasks-dashboard - 死代码残留清理: vite 依赖 / 单字母别名 / tasks 转发 / dashboard 死分支

> backlog_id: R-314

## 1. 背景与动机

由 spec.json 渲染生成。

## 2. 需求清单

### 功能需求
- [x] FR-1: 从 `package.json` dependencies 移除 `vite`，并把 `@types/prompts` 移入 devDependencies
- [x] FR-2: 注销 `s` / `st` / `c` 三个单字母别名，删除 `src/commands/register/aliases.ts` 及其注册调用点；调用别名时 fail-loud（非零退出 + 提示全名）
- [x] FR-3: 删除 `tasks` deprecated 转发命令与 `src/commands/tasks.ts` 实现文件；`task drift` / `task sync` 行为零变更
- [x] FR-4: 从 `src/utils/ui-gate.ts` 正则摘除 `dashboard` 关键词，其余关键词（`Figma|Stitch|v0|Framer|前端|组件|CSS` 等）保持不动
- [x] FR-5: 按 R-301 六维范式清理残留引用（注册 / 实现 / 元数据 / 模板 / 测试 / 协议），并对已删命令补 fail-loud 防复辟断言

### 非功能需求
- [x] NFR-1: `pnpm install` + `pnpm build` + `pnpm test` 全绿，typecheck 无错
- [x] NFR-2: 删除面严格限制在 A 档四项，`trace` 命令本身保留（它是本次决策的唯一实证来源）
- [x] NFR-3: 不触碰 `init` / `doctor` / `commit` / `unlink` 等人类入口命令（trace 零命中属采样盲区，见 R-315/R-316）

## 3. 范围界定

### 包含
- `package.json` 依赖结构修正（vite 移除、@types/prompts 归位）
- 单字母别名 `s` / `st` / `c` 全链删除
- `tasks` deprecated 转发命令全链删除
- `ui-gate.ts` 的 `dashboard` 死分支摘除
- 上述四项的模板 / 协议 / 元数据 / 测试同步清理 + fail-loud 断言

### 不包含
- `trace` 命令（记录方，保留）
- `init` / `doctor` / `commit` / `unlink` / `install` 等人类入口（采样盲区，不在本次收敛范围）
- R-315（零使用命令）与 R-316（待裁决大块）—— 独立任务，互不阻塞
- prompt emitter 家族与仪式压缩（C 档，本轮不做）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | spec.json 渲染 | JSON / Markdown | JSON | 机器真源重建视图 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 问题: trace 遥测实证的死代码残留（vite dashboard 依赖 / 单字母别名 / tasks 转发 / ui-gate dashboard 死分支）增加维护面与命令规模
- 方案:
  - A 合并: 四项残留合并为一个任务全链删除（互不耦合，任一失败可独立回滚）
  - B 拆四个 quick: 被否，跨 package.json 需重跑 install，不属 quick 语义
  - C 只删 vite: 被否，勘察成本已沉没
- 选择: A 合并
- 理由: 四项均为纯删除死代码，无行为变更、无 API 契约变化；删除 public 命令触及命令面边界，按协议走重大变更确认
- 风险: 别名删除影响人类脚本 → 已按 fail-loud 提示处理，本仓库与 SynapBuddy 均未发现依赖别名的脚本
- 用户确认: 2026-08-30 用户确认执行 A+B 档收敛（trace 1460 条实证）；2026-09-06 用户指示"继续，优化现有功能"再次确认延续本任务

## 5. 验收标准

- [x] AC-1: `vite` 不在 dependencies；`pnpm install && pnpm build && pnpm test` 全绿
- [x] AC-2: `@types/prompts` 位于 devDependencies
- [x] AC-3: `docpath s` / `docpath st` / `docpath c` 均返回非零退出并提示对应全名
- [x] AC-4: `ui-gate.ts` 正则无 `dashboard`，其余关键词完整保留（单测断言）
- [x] AC-5: `docpath tasks` 返回非零退出；`docpath task drift` / `task sync` 行为与改动前一致（task-command 套件绿）
- [x] AC-6: 六维 grep 无残留引用；命令元数据条目数下降
- [x] AC-7: 全量测试 + typecheck 通过，零行为回归
