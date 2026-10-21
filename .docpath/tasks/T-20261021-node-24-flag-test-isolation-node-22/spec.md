# T-20261021-node-24-flag-test-isolation-node-22 - 修复测试门禁误注入 Node 24+ 专属 flag

> backlog_id: R-501

## 1. 背景与动机

`docpath check` / `docpath done --commit` 的测试项在两处硬编码注入了 `--test-isolation=process`：

- `src/engine/test-scope.ts:198`（`buildNodeTestCommand`）
- `src/engine/step-verify.ts:278`（node 靶向测试 argv）

该 flag 自 Node 24 才有。在 Node 22.22.2 上执行直接得到 `node: bad option: --test-isolation=process`，进程以非零码退出，测试项被判定为失败——**任何项目在这台机器上都无法通过 check**。

更隐蔽的是：`last-check.json` 显示 `cached: true` 时，旧的通过证据会掩盖这一必然失败，让门禁看起来是绿的。本次 R-021 收口正是先被缓存骗过、再被真实失败拦住才暴露出来。

同时 `step-verify` 的靶向测试路径与 `check` 的全量路径使用了两套独立拼接逻辑，属于同一缺陷的双份实现。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 以 Node 主版本为判据解析隔离 flag，并让两处调用点共用同一实现
  - 新增 `resolveTestIsolationFlag(nodeVersion: string = process.versions.node): string | null`
  - `major >= 24` 返回 `'--test-isolation=process'`；`22.x` 与 `21.x` 及以下返回 `null`（Node 22 的 `--test` 默认即为 process 隔离，无需显式注入）
  - 版本号缺失或非法时返回 `null`（fail-safe 到"不注入"，保证不会因解析异常再次制造 bad option）
  - `buildNodeTestCommand` 仅在 `opts.isolation !== false` 时追加解析结果；`opts.isolation === false` 仍严格不注入
  - `step-verify.ts` 的 node 分支改为按解析结果条件拼接，删除硬编码字面量
  - 更新 `test-scope.ts` 顶部模块注释中关于进程隔离的描述，注明版本条件
  - 新增 `tests/test-isolation-flag.test.mjs` 覆盖 22 / 24 / 26 / 非法版本与 `isolation: false` 组合

### 非功能需求

- [ ] NFR-1: 不新增依赖，不改变 `--test-concurrency` 的既有计算逻辑
- [ ] NFR-2: Node 22 与 Node 26 两个运行时下，`npm test` 均全绿
- [ ] NFR-3: 不改变 check 缓存键语义以外的行为；不得通过"忽略 bad option 输出"掩盖失败

## 3. 范围界定

### 包含

- `src/engine/test-scope.ts`、`src/engine/step-verify.ts`
- 新增单测文件

### 不包含

- 修改 Node 版本探测机制（仍以运行 docpath 的 Node 为准）
- 处理其他 Node 版本差异导致的 flag 兼容问题
- 调整 check 缓存策略（缓存掩盖失败属独立议题）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 修复方式 | 删除 flag / 一律用 `--experimental-test-isolation` / 版本感知 | 版本感知 | 删除会丢掉显式意图；experimental 名在 24 又被改回，跨版本更脆 |
| 2 | 判据来源 | `process.versions.node` / 额外 spawn `node --version` | `process.versions.node` | 省略 flag 在任何版本都安全（默认即 process），无需为探测多付一次进程开销 |
| 3 | 失败兜底 | 捕获 bad option 后重试无 flag | 不重试 | 会把真实失败吞成"重试成功"，且让每次失败多付一次全量测试成本 |
| 4 | 实现归位 | 两处各自判断 / 抽公共函数 | 抽公共函数 | 双份实现是本次缺陷的成因，必须收敛 |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [ ] 否
- [x] 是，需要用户确认

### 变更类型

- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief

- 当前问题: 测试门禁在 Node 22 上必然失败，原因是两处调用点硬编码了 Node 24 才有的 `--test-isolation=process`；失败还可能被 check 缓存掩盖。
- 目标: 按 Node 主版本决定是否注入该 flag，并把两处重复逻辑收敛为一个可单测的函数。
- 背景: 来自 backlog R-501；R-021 在 hippo 仓库收口时实测到 `node: bad option`。
- 可选方案:
  - 方案 A（采纳）: 版本感知解析 + 公共函数 + 单测
  - 方案 B（否决）: 直接删掉 flag —— 显式意图丢失，若未来默认隔离变为 none 会静默退化
  - 方案 C（否决）: 统一改用 `--experimental-test-isolation=process` —— 该名称在 Node 24 已改名，在 22 与 24 之间反而制造新的分裂
  - 方案 D（否决）: 捕获 bad option 后自动重试无 flag —— 把真实失败伪装成通过，且失败路径多跑一次全量测试
- 推荐方案: 方案 A
- 决策理由: 最小改动、可单测、跨版本语义一致；省略 flag 在 22/24/26 上都等价于 process 隔离，因此不存在遗漏场景
- 不做什么: 不引入版本探测子进程、不调整缓存策略、不改并发计算
- 成本: 约 30 行实现 + 60 行测试
- 风险: 若 docpath 运行时 Node 与执行测试的 `node` 不同版本，判据可能错位；但省略 flag 在所有版本均安全，最坏情况只是少一次显式声明，不会失败
- 回滚方案: 还原两处调用点即可
- 用户确认: 用户在 2026-10-21 会话中同意先修此门禁缺陷再进 P2

## 5. 验收标准

- [ ] AC-1: Node 22.x 下不注入 `--test-isolation`，Node 24/26 下注入；非法版本号不抛异常且不注入
- [ ] AC-2: `opts.isolation === false` 时无论版本均不注入
- [ ] AC-3: `test-scope` 与 `step-verify` 两处均调用同一解析函数，仓库内不再出现硬编码的 `--test-isolation=process` 字面量
- [ ] AC-4: 新增单测覆盖 22 / 24 / 26 / 非法版本 / isolation=false 五种输入并通过
- [ ] AC-5: Node 22.22.2 下 `docpath check` 的测试项恢复正常通过
