# T-20261021-check-node - check 缓存键纳入工具链指纹：Node 版本变化必须使绿色证据失效

> backlog_id: R-502

## 1. 背景与动机

`check` 的缓存判定键是 `code_scope_digest`（R-331）：只哈希 scope 内文件字节，**不含运行时工具链**。

后果已经在实机出现：R-501 之前，`--test-isolation=process` 在 Node 22 上必然 `bad option`，但 `last-check.json` 里一条 `cached: true` 的旧证据让门禁报绿。代码没变、环境变了，缓存却认为"上次通过仍然有效"。

这类失效不对等：代码变 → 缓存 miss（安全）；环境变 → 缓存 hit（危险）。缓存键必须覆盖所有会改变判定结果的输入。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 把工具链指纹纳入 check 缓存键，并落盘以便诊断
  - 新增 `computeToolchainFingerprint(nodeVersion = process.versions.node, platform = process.platform, arch = process.arch): string`，形如 `22.22.2|darwin|arm64`
  - `computeCodeScopeDigest(cwd, customScopePaths?, toolchain = computeToolchainFingerprint())` 与 `computeCategoryDigest(cwd, category, customScopePaths?, toolchain?)` 在哈希文件前先 `hash.update('toolchain:' + toolchain + '\n')`
  - `LastCheckEvidence` 增加可选 `toolchain?: string`；写入证据时落盘当前指纹
  - 既有证据不含 `toolchain` 时，其 digest 因缺少前缀必然不匹配 → 首次升级后缓存 miss 一次，随后恢复命中（可接受的一次性代价）
  - `tryReuseCachedHeavyChecks` / `tryReuseGranularCategoryChecks` 仍以 digest 等值为唯一判据，不额外做版本比较（指纹已进哈希）
  - 新增 `tests/check-cache-toolchain.test.mjs`：同指纹 digest 稳定、异指纹 digest 不同、证据字段可落盘读取

### 非功能需求

- [ ] NFR-1: 指纹不引入子进程探测（直接读 `process.versions` / `process.platform` / `process.arch`）
- [ ] NFR-2: 指纹不变时缓存命中率不下降
- [ ] NFR-3: 非 git 仓仍返回 `null` 并回落全量，语义不变

## 3. 范围界定

### 包含

- `src/commands/check/cache.ts`、`src/utils/workspace-evidence.ts`、`src/commands/check/evidence.ts`
- 新增单测

### 不包含

- 编译器/解释器版本探测（如 tsc、gcc 版本）
- 依赖树指纹（lockfile 已在 scope 路径内）
- 缓存失效原因的 UI 展示（仅落盘字段）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 指纹粒度 | 仅 major / 完整版本 | 完整版本 | patch 升级也可能改变测试行为；一次 miss 的成本远低于一次假绿 |
| 2 | 指纹组成 | node 版本 / +platform+arch | 三者 | 跨平台迁移同样会改变判定（原生模块、路径语义） |
| 3 | 实现位置 | 各 digest 函数内 / 包一层 key 构造 | 各函数内混入 | 两条缓存路径（全量/分门类）都走同一前缀，避免漏改 |
| 4 | 旧证据兼容 | 迁移/补写 / 自然 miss | 自然 miss | 旧 digest 无前缀必然不等，无需额外的版本迁移逻辑 |
| 5 | 失效可诊断性 | 只改哈希 / 同时落盘字段 | 同时落盘 | 便于日后回答"为什么这次没命中" |

## 4.1 重大变更门禁

### 是否涉及重大变更

- [ ] 否
- [x] 是，需要用户确认

### 变更类型

- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
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

- 当前问题: 缓存键只覆盖代码字节，不覆盖运行时；环境变化（Node 版本）后旧绿色证据仍会被复用，导致门禁假绿。
- 目标: 把 node 版本 + platform + arch 混入 digest，并把指纹落盘，使环境变化必然 miss 且可诊断。
- 背景: 来自 backlog R-502；R-501 的 flag 缺陷曾被 `cached: true` 掩盖一轮，属于真实事故。
- 可选方案:
  - 方案 A（采纳）: 指纹进哈希前缀 + 证据落盘字段
  - 方案 B（否决）: 缓存命中前额外比较一次 node 版本 —— 两条缓存路径都要加分支，且无法覆盖 platform/arch
  - 方案 C（否决）: 提交后清空缓存文件 —— 粗暴且无法区分"代码没变"与"环境变了"
  - 方案 D（否决）: 只记录 fingerprint 不参与哈希 —— 只能诊断不能防错，等于没修
- 推荐方案: 方案 A
- 决策理由: 缓存键的语义是"所有影响判定的输入"，环境本就是输入之一；混入哈希是最小且无法绕过的实现
- 不做什么: 不做编译器版本探测、不做 UI 展示、不做旧证据迁移
- 成本: 约 40 行实现 + 70 行测试
- 风险: 升级后所有既有证据首次必然 miss，用户会看到一次"缓存失效"；属一次性成本，需在提交信息里说明
- 回滚方案: 移除哈希前缀与字段即可恢复旧行为
- 用户确认: 用户在 2026-10-21 会话中同意先做缓存键工具链指纹

## 5. 验收标准

- [ ] AC-1: 同一工具链指纹下 digest 稳定，不同指纹（仅 node 版本不同）下 digest 必然不同
- [ ] AC-2: `last-check.json` 写出 `toolchain` 字段，且值与 `computeToolchainFingerprint()` 一致
- [ ] AC-3: 分门类 digest 与全量 digest 都包含指纹前缀（两条缓存路径都不漏）
- [ ] AC-4: 非 git 仓仍返回 `null`，`tryReuse*` 回落全量的语义不变
- [ ] AC-5: 新增单测通过，Node 22 下既有 check 测试不回归
