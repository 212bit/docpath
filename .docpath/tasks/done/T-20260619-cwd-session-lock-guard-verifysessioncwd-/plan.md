## 执行计划

### S1: session.ts 加 verifySessionCwd + isAbsolute 导入修复
- **描述**: 在 `src/utils/session.ts` 中从 `node:path` 导入 `resolve`、`relative`、`isAbsolute`；从 `./worktree.js` 导入 `getGitTopLevel`、`listWorktrees`；实现 `verifySessionCwd(cwd, sessionId)` — 当 sessionId 非 default 时遍历所有 worktree，若当前 cwd 不在 session 绑定目录下则抛出跨目录门禁错误
- **验收条件**: `tsc --noEmit` 通过；verifySessionCwd 对非 default session 执行跨 cwd 检查；default session 直接返回
- **依赖**: 无

### S2: index.ts 加 pre-command verifySessionCwd 钩子
- **描述**: 在 `src/index.ts` 中导入 `resolveSessionContext`、`verifySessionCwd`；在命令匹配成功后、执行前加 bypass 列表（`worktree`、`projects`、`init`、`config`）；对非 bypass 命令调用 `await verifySessionCwd(cwd, sessionId)`
- **验收条件**: `tsc --noEmit` 通过；bypass 命令不触发检查；正常命令触发检查
- **依赖**: S1

### S3: 新增 tests/cwd-session-lock.test.mjs
- **描述**: 新增测试文件覆盖三个场景：(1) default session 绕过检查（两个不同 cwd 均返回 0）；(2) 自定义 session 绑定首次 cwd（session 文件创建在 cwd1）；(3) 相同 session 在不同 cwd 执行被拦截（exit code 非 0，输出含"跨目录门禁拦截"）；bypass 命令（worktree list）不被拦截
- **验收条件**: `node --test tests/cwd-session-lock.test.mjs` 全量绿
- **依赖**: S1, S2

### S4: pnpm build + pnpm test 全量验证
- **描述**: 运行 `pnpm run build` 确认编译干净；运行 `pnpm test` 确认全量测试绿；运行 `docpath check` 通过
- **验收条件**: 构建无 error；全量测试绿；docpath check 通过
- **依赖**: S1, S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
S1 → S3
