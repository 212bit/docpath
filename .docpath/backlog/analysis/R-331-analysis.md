# R-331 分析：check 门禁时延构成与优化方案（2026-09-11）

## 实测构成（本机）

| runner | 耗时 | 占比 |
|---|---|---|
| tsc --noEmit（typecheck） | 1.5s | ~3% |
| tsup --clean（build） | ~1s | ~2% |
| node --test 全量套件 | **51.9s**（user 149s + sys 75s，多进程并行已生效） | **~95%** |

结论：时延大头是测试套件本身（60+ 文件、数百次 node 子进程 spawn），typecheck/build 已很快。
单点优化 tsc/tsup 无意义；两条有效路径：

1. **scope 缓存（本任务主交付）**：代码范围（src/tests/构建配置）自上次绿色 check 无变更时，
   复用重 runner（typecheck/build/test）判定，结构门禁照跑。docpath 自用循环里大部分 check
   （rules/backlog/docs 类改动、任务簿记）将落到 2-3s 档。代码变更仍付全量——这是诚实的：
   缓存只服务「代码没变却反复过门禁」的场景。
2. 套件内部提速（减少 spawn/固定超时）：收益存在但属于另一个量级的重构，不进本任务范围。

## sqlite 竞态前提修正

关键记忆（2026-09-10 上午）记录的「init 类用例竞态共享 projects.sqlite」**已随 f75543e
（2026-09-10 21:54「并发 4→10 提速 + init 注册中心进程级隔离」）修复**：

- 隔离机制存在：`DOCPATH_REGISTRY_DB` 环境变量（project-registry.ts:45）+
  tests/registry-isolation.mjs 进程级 helper；
- 静态核查：全仓库 spawn `docpath init` 的测试文件仅 4 个
  （init.test.mjs 逐用例传 env；scan-existing-claude/config/docs-paths 导入 helper），全部已隔离；
- 其余 `'init'` 匹配均为 `git init`，不触碰注册中心。

本任务验证方式调整：跑一次全量套件确认全绿（今日已跑 2 次全绿，含 51.9s 实测），无需重写隔离。

## scope 缓存设计

- digest = sha256(`git rev-parse HEAD` + `git status --porcelain=v1 --untracked-files=all -- <scope>`)，
  scope = src tests scripts package.json pnpm-lock.yaml tsconfig.json tsup.config.ts。
  HEAD 不变且 scope 内 status 为空 ⇒ scope 内容与上次绿色 check 逐字节一致。
- 存储：扩展 last-check.json（已有 head/passed/checks 骨架）新增 code_scope_digest + cached 标记。
- 命中条件：last-check.json 为绿色全量结果（非 lite/降档产物）且 digest 相等 ⇒ 注入缓存的
  重 runner 结果（标注「缓存复用」），runTaskDocumentChecks/harness 等结构门禁照常执行。
- 逃逸口：`--no-cache` 强制全量；代码一旦变更（digest 变）自动回落全量，fail-safe 到慢不放水。
- 守恒语义：不放宽任何门禁——缓存的判定本身来自一次真实全量绿色 check。

## 测试计划（tests/check-cache.test.mjs）

1. digest 稳定性：同状态同 digest；scope 文件变更 → 变；非 scope（docs/.docpath）变更 → 不变。
2. e2e（临时仓 + 秒级脚本 package.json）：全量绿 → 改 docs → check 二次命中（输出含缓存复用）→
   改 src → 自动回落全量。
3. last-check.json 落 digest 字段断言。
