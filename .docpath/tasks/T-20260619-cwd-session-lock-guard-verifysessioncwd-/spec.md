# T-20260619-cwd-session-lock-guard-verifysessioncwd- - cwd-session-lock guard: verifySessionCwd + index.ts integration

> backlog_id: R-217
> backlog_source: docpath backlog add

## 1. 背景与动机

上一个 session 实现了 verifySessionCwd（跨目录门禁）功能：session.ts 加 verifySessionCwd/resolveSessionContext，index.ts 加 pre-command 检查。实现完成且通过测试，但 linter 回退了 src 变更，test 文件也丢失，未提交。

## 2. 需求清单

### 功能需求
- [ ] FR-1: session.ts 加 verifySessionCwd：非 default session 时扫描所有 worktree，若当前 cwd 不在 session 绑定目录下则抛出跨目录门禁错误
- [ ] FR-2: index.ts 加 pre-command 钩子：非 bypass 命令（worktree/projects/init/config）调用 verifySessionCwd
- [ ] FR-3: 新增 tests/cwd-session-lock.test.mjs 覆盖三个场景

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容；default session 不受影响

## 3. 范围界定

### 包含
- session.ts: verifySessionCwd 实现
- index.ts: pre-command 检查钩子
- tests/cwd-session-lock.test.mjs: 场景测试

### 不包含
- 修改现有 lease/session 记录格式
- UI/产品变更

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | bypass 命令列表 | 全部检查 vs 按命令列表排除 | 排除 worktree/projects/init/config | 这些命令本身不读写任务状态，不应被 session 绑定影响 |
| 2 | 找不到 session 文件时的行为 | 报错 vs 放行 | 放行 | session 文件由 touchSession 惰性创建，首次调用前不存在属正常状态 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）

### Decision Brief
- 当前问题: 多 Agent 并发时，不同 worktree 的 session 可能跨 cwd 互相干扰，导致状态错误写入
- 目标: 非 default session 绑定到首次激活的 worktree，跨 cwd 调用时直接拦截并给出明确错误
- 背景: linter 回退了上一次的实现，此次重新实现并补测试
- 可选方案: (A) 实现 verifySessionCwd 门禁（当前选择）；(B) 仅文档化不加硬门禁；(C) 通过 DOCPATH_CWD 环境变量固定
- 推荐方案: A — session 文件绑定目录，跨 cwd 时 CLI 入口直接 exit 1
- 不做什么: 不修改 lease 格式；不影响 default session；不加 --force 绕过选项
- 成本: 低，S1-S4 共 ~100 行代码
- 风险: 误拦截合法场景（如 cd 到子目录）→ 缓解：isInside 检查允许子目录
- 回滚方案: git revert 本次提交即可，旧行为完全恢复
- 用户确认: 已确认（2026-06-20），用户明确要求修复此问题

## 5. 验收标准

- [ ] AC-1: `tsc --noEmit` 通过
- [ ] AC-2: default session 两个不同 cwd 均可正常执行
- [ ] AC-3: 自定义 session 在不同 cwd 执行时被拦截（exit code 非 0，含"跨目录门禁拦截"）
- [ ] AC-4: bypass 命令（worktree list）不被拦截
- [ ] AC-5: pnpm test 全量绿

---

*此文件由 `docpath write-spec` 更新。*
