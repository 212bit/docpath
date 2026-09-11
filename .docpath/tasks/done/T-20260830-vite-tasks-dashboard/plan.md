## 执行计划

### S1: package.json 依赖结构修正
- [x] S1: package.json 依赖结构修正
- **描述**: 从 dependencies 移除 vite（`package.json:31`），把 `@types/prompts` 从 dependencies 移入 devDependencies，重跑 `pnpm install` 确认 lockfile 更新且构建通过。**不动** `detect.ts` / `major-change.ts` 中扫描用户项目的 vite 字符串规则。
- **验收条件**: `pnpm install && pnpm build` 均成功；`package.json` 的 dependencies 不含 `vite` 与 `@types/prompts`，devDependencies 含 `@types/prompts`；`detect.ts:139` 与 `major-change.ts:34` 原样保留。
- **依赖**: 无

### S2: 单字母别名全链删除
- [x] S2: 单字母别名全链删除
- **描述**: 删除 `src/commands/register/aliases.ts`（68 行），从 `src/commands/register.ts:17` 移除 `registerAliases` 的 import 与调用点。确认 `docpath s` / `docpath st` / `docpath c` 回退到 cac 未知命令处理后返回非零退出。补 CLI 断言：三个别名均非零退出，且 `status` / `check` 全名仍正常工作。
- **验收条件**: `src/commands/register/aliases.ts` 不存在；`register.ts` 无 `aliases` 引用；新断言覆盖三个别名非零退出 + 两个全名正常；`cli-positionals` 套件绿。
- **依赖**: 无

### S3: tasks deprecated 转发全链删除
- [x] S3: tasks deprecated 转发全链删除
- **描述**: 删除 `register/backlog-maintenance.ts:51-62` 的 tasks 注册块与 `command-metadata.ts:36` 的条目。**首动作必须先确认** `task drift|sync` 的实现归属：若与 `tasksCommand` 同在 `src/commands/tasks.ts`，需先把 drift/sync 逻辑迁至 `task.ts` 再删除 `tasks.ts`。随后扫 `templates/protocols/*.md` 命令清单同步，并补 fail-loud 断言。
- **验收条件**: `src/commands/tasks.ts` 不存在；`docpath tasks <action>` 非零退出并提示 `task drift | task sync`；`docpath task drift` 与 `task sync` 行为与改动前逐字一致（task-command 套件绿）；metadata 条目数下降；协议清单无 tasks 残留。
- **依赖**: 无（但与 S2 同属注册层改动，建议顺序执行以便 bisect）

### S4: ui-gate 死分支摘除
- [x] S4: ui-gate 死分支摘除
- **描述**: 从 `src/utils/ui-gate.ts:30` 的正则中移除 `|dashboard`，其余关键词（`UI/UX|UI|产品 UI|UX|用户界面|界面重构|页面重构|页面|layout|navigation|visual|视觉|设计预览|视觉验收|Design Preview|Visual Acceptance|responsive UI|响应式界面|Figma|Stitch|v0|Framer|frontend|front-end|前端|component|组件|CSS`）逐字保留。补单测断言并实跑两个相关套件。
- **验收条件**: 正则不含 `dashboard`；`Figma|Stitch|v0|Framer|前端|组件|CSS` 仍命中；`tests/ui-gate.test.mjs` 与 `tests/go-ui-gate.test.mjs` 实跑全绿且 exempt 结论不变。
- **依赖**: 无

### S5: 六维残留扫描与全量验证
- [x] S5: 六维残留扫描与全量验证
- [x] S5: 六维残留扫描与全量验证
- **描述**: 全仓 grep 确认无残留引用（排除 `node_modules/` `dist/` `.git/` `.docpath/tasks/done/` `promote-backups/`），AC-1~AC-7 逐条现场核对并留证据，`pnpm build` + `pnpm test` + `pnpm typecheck` 全绿。
- **验收条件**: 六维 grep 零残留；AC-1~AC-7 逐条有现场证据；全量测试与 typecheck 零失败。
- **依赖**: S1, S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
