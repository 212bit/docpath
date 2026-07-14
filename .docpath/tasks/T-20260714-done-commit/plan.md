## 执行计划

### S1: soft-dirty-reminder 检测函数与分流复用
- [x] S1: soft-dirty-reminder 检测函数与分流复用
- **描述**: 在 `src/utils/` 新增（或扩展 git-dirty-guard）纯函数 `detectUncommittedNonDocPathFiles(cwd): { nonDocPathFiles: string[]; count: number }`,复用现有 `isDocPathManagedPath` 与 `collectDirtyFiles` 收集非 DocPath 未提交文件;签名纯函数、无副作用、可独立测试。这是给 done 软提醒的接口层。
- **验收条件**: 函数可孤立 import 调用并返回 `{nonDocPathFiles, count}`,纯 DocPath 改动时返回空,业务文件改动时返回文件清单。
- **依赖**: 无

### S2: 软提醒渲染器（W2 列文件 + 免责）
- [x] S2: 软提醒渲染器（W2 列文件 + 免责）
- **描述**: 新增纯函数 `renderCommitReminder(nonDocPathFiles: string[]): string`,输出 W2 形态:文件清单 + 建议 commit 命令 + 免责声明（"可能混合多个任务/agent,请确认归属后再 commit"）。不调 git,只生成字符串。
- **验收条件**: 给定文件清单,输出含 (a)醒目 banner (b)逐文件列表 (c)建议 commit 命令 (d)免责声明 四要素;空清单时返回空串。
- **依赖**: S1

### S3: done 命令接入软提醒（不阻断）
- [x] S3: done 命令接入软提醒（不阻断）
- **描述**: 在 `done.ts` 的 check→review→journal 序列之前（或之后审计段），调 `detectUncommittedNonDocPathFiles`;count>0 时 `console.warn(renderCommitReminder(...))`,但**不改退出码、不抛错**。`done.ts` 应用层审计输出同步含提醒计数行。
- **验收条件**: 工作树有业务文件未提交时,done 输出含醒目软提醒;`done` 退出码仍为 0;仅 .docpath/ 产物时 done 不打印业务提醒。
- **依赖**: S1, S2

### S4: --no-dirty-reminder 静音开关
- [x] S4: --no-dirty-reminder 静音开关
- **描述**: 给 `done` 与 `agent done` 加 `--no-dirty-reminder` flag（透传至底层 agentCommand）;done 启动时解析该 flag,为真则跳过 S3 的软提醒打印。默认开启（不打 flag 时仍打印）。
- **验收条件**: `docpath done --no-dirty-reminder` 在有未提交业务文件时静音不打印;默认（不带 flag）仍打印。
- **依赖**: S3

### S5: 测试覆盖 AC-1~5 + 兼容性回归
- [x] S5: 测试覆盖 AC-1~5 + 兼容性回归
- **描述**: 新增 `tests/done-soft-reminder.test.mjs` 覆盖 AC-1~5:(1)脏业务→打印+列文件 (2)仅 DocPath→不打印 (3)免责声明存在 (4)退出码 0 (5)--no-dirty-reminder 静音；并跑现有 `dirty-worktree-guard.test.mjs` 与 done 相关测试确认 NFR-1（与现有工作流兼容、未破坏既有 guard 行为）。
- **验收条件**: 新测试 5 例全绿;现有 dirty-worktree-guard 与 done/handoff 测试无回归。
- **依赖**: S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
