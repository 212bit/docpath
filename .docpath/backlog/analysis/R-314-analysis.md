# R-314 分析：死代码残留清理

## 勘察结论（2026-08-30 现场核实，非推断）

### 1. `vite` 依赖 —— 确认为 dashboard 残留

```bash
$ git log --oneline --all --grep="ashboard" | head -5
754d11b feat: Remove Web Dashboard
```

dashboard 整体删除后，`package.json:31` 的 `"vite": "6.3.5"` 未随之下架。

```bash
$ grep -rn "from ['\"]vite" src/    # 零命中
$ grep -rn "vite" package.json tsconfig.json tsup.config.ts scripts/*.mjs
package.json:31:    "vite": "6.3.5",
```

即 vite 在本项目的唯一用途是当年 dashboard 的 React UI 构建，现为零引用。**删除零风险。**

另注意：`dependencies` 中还有 `@types/prompts`，属类型包，应在 `devDependencies`。

### 2. 单字母别名 `s` / `st` / `c`

`src/commands/register/aliases.ts`（68 行）注册三个别名，服务于人类手工敲命令。

trace 1460 条记录中，Agent 调用一律使用全名（`status` 44 次、`check` 73 次），**别名零命中**。别名对 Agent 零收益，对人类的收益是省 3~5 个字符，代价是命令表膨胀 + `command-metadata` 多三条维护面。

**删除零风险。**

### 3. `tasks` deprecated 转发

`src/commands/register/backlog-maintenance.ts:51`：

```
// R-299: tasks 并入 task 子动作（同名易混）；tasks 保留一个版本周期的兼容转发。
```

自述"保留一个版本周期"，R-299 至 2026-08-30 已远超一个周期。trace 中 `tasks` 零命中，`task` 亦零命中（但 `task` 提供 abort/reset/reopen/drift/sync，是任务管理正路，保留）。

**删除零风险。**

### 4. `ui-gate.ts` 的 `dashboard` 关键词

`src/utils/ui-gate.ts:30` 的 UI 检测正则包含 `dashboard`。dashboard 命令已不存在，该分支永不命中，属死分支。

注意：该正则里还有 `Figma|Stitch|v0|Framer|前端|组件|CSS` 等，**只摘 `dashboard` 一项，其余不动**。

### 5. 不在本条目范围（ recorder 保留 ）

`trace` 命令自身在 trace 日志里零命中，因为它是**记录方**而非被记录的调用。它产出的 1460 条数据正是本次收敛决策的唯一实证来源，**必须保留**。

同类：`init` / `doctor` / `commit` / `unlink` 零命中属 trace 采样盲区（只记录 hook 插桩会话），已明确排除在本次收敛外，见 R-315/R-316。

## 影响面

| 项 | 注册 | 实现 | 元数据 | 模板 | 测试 | 协议 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| vite 依赖 | — | — | — | — | — | — |
| 单字母别名 | `aliases.ts` + `register.ts` 调用点 | 无独立实现 | 无 | 无 | 需补 fail-loud | 无 |
| tasks 命令 | `backlog-maintenance.ts:51` | `src/commands/tasks.ts` (88) | 需查 | 需查 | 需查 | 需查 |
| dashboard 关键词 | — | `ui-gate.ts:30` | — | — | — | — |

执行时按 R-301 已验证的六维范式逐维清理，并对已删命令补 fail-loud 断言防复辟。

## 方案比选

- **方案 A（采纳）：四项一次性清理**。彼此无耦合，任一失败可独立回滚，合并为一个任务降低门禁开销。
- 方案 B：拆四个 quick 任务。被否 —— quick 通道适用于微型改动，本条目跨 package.json / src / 模板 / 协议，且需改依赖后重跑 `pnpm install`，不属于 quick 语义。
- 方案 C：只删 vite，其余留待后续。被否 —— 四项勘察成本已沉没，分批改反而多付门禁代价。

## 风险与回滚

- `vite` 删除后需重跑 `pnpm install` 并验证构建。**回滚**：恢复 package.json 一行。
- 别名删除后，若有人类脚本依赖 `docpath s`，会失败。**缓解**：保留清晰的错误提示指引到全名；此类脚本在本仓库与 SynapBuddy 均未发现。
- `tasks` 删除后，`task drift` / `task sync` 行为必须完全不变（R-299 已把逻辑迁入 `task`）。

## 验收映射

| AC | 验收项 | 验证方式 |
| :-- | :--- | :--- |
| AC-1 | vite 出依赖，构建测试通过 | `pnpm install && pnpm build && pnpm test` |
| AC-2 | 三别名注销且 fail-loud | CLI 断言：执行返回非零退出并提示全名 |
| AC-3 | tasks 删除且 task drift/sync 不变 | task-command 套件保持绿 |
| AC-4 | ui-gate 正则摘除 dashboard | 单测断言 |
| AC-5 | @types/prompts 归位 devDependencies | package.json 结构断言 |
| AC-6 | 六维无残留引用 | grep 断言 + 全量套件 |
