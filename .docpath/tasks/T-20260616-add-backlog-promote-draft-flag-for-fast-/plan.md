## 执行计划

### S1: 补齐 --draft 专项测试（promote 快速通道）
- **描述**: 在 tests/backlog-command.test.mjs 新增用例，验证 `docpath backlog promote --draft R-xxx` 对未达成熟度（readiness 不足 / 缺 evidence / 缺 user_confirmed）的条目不再抛错，直接创建任务并推进到 active。覆盖 level 2/level 3 两种条目，对照不加 --draft 时仍按原门禁报错。
- **验收条件**: `--draft` 跳过成熟度检查建任务成功；无 `--draft` 仍报 `assertBacklogReadyForExecution` 错误；测试在 `node --test` 下通过。
- **依赖**: 无

### S2: 覆盖 accept/plan 的 --draft 通路
- **描述**: 在 tests/backlog-command.test.mjs 新增用例，验证 `backlog accept --draft` 与 `backlog plan --draft` 同样跳过成熟度检查（backlog.ts:648 共用 skipCheck），确认三动作行为一致。
- **验收条件**: accept/plan 加 `--draft` 对未成熟条目成功；测试通过。
- **依赖**: S1

### S3: 验证默认行为不变（回归守护）
- **描述**: 新增/强化用例，确认不加 `--draft` 时 promote/accept/plan 对未成熟条目仍严格按原 readiness/evidence/user_confirmed 门禁报错，确保 --draft 是纯 opt-in、不污染默认路径。
- **验收条件**: 默认路径报错信息与文案符合既有 `assertBacklogReadyForExecution` 建议；测试通过。
- **依赖**: S1

### S4: 全量 check 收尾
- **描述**: 运行 `pnpm typecheck` + `node --test tests/*.test.mjs` + `docpath check`，确认编译、测试、上下文健康全部通过（plan.md 已生成后上下文缺失项应消除）。
- **验收条件**: typecheck 无错误；全量测试通过；`docpath check` 不再因上下文/编译失败。
- **依赖**: S1, S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2
S1 → S3
S1 → S4
S2 → S4
S3 → S4
