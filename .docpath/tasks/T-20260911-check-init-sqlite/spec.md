# T-20260911-check-init-sqlite - check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）

> backlog_id: R-331
> backlog_source: docpath backlog capture

## 1. 背景与动机

【实测定性 2026-09-11，见 analysis】时延构成：tsc 1.5s + tsup ~1s + node --test 全量套件 51.9s（95%）。sqlite 竞态前提已修正：f75543e（9/10 21:54）已落地 DOCPATH_REGISTRY_DB 进程级隔离，4 个 spawn init 的测试文件全部隔离，今日全量套件 2 次全绿。主交付改为 scope 缓存：代码范围（src/tests/构建配置）digest 与上次绿色 check 一致时复用重 runner 判定，结构门禁照跑，--no-cache 逃逸，fail-safe 到慢不放水。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-331-analysis.md

## 2. 需求清单

### 功能需求
- [x] FR-1: check 门禁时延优化：scope 缓存复用重 runner 判定（digest 等值命中，结构门禁照跑，--no-cache 逃逸）
  - 来源 backlog: R-331

### 非功能需求
- [x] NFR-1: 保持与现有 DocPath 工作流兼容（缓存的判定来自真实全量绿色 check，门禁强度不变；digest 计算失败回落全量）

## 3. 范围界定

### 包含
- src/commands/check/cache.ts：内容寻址 scope digest + 缓存复用判定
- check.ts 集成（runProjectChecks 前）、evidence 落 digest/cached 字段、CLI --no-cache
- tests/check-cache.test.mjs：digest 三态 + 跨提交不变 + e2e 命中/回落

### 不包含
- 测试套件内部提速（spawn 精简/固定超时治理）——另一量级的重构，留待后续条目
- 非 check 命令的缓存（done/review 不改动其门禁语义，仅随 check 自动受益）

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | digest 方案 | HEAD+status / 内容寻址 | 内容寻址 | 同字节跨提交边界命中，收口链路（check→commit→done 再 check）不付第二次全量 |
| 2 | 复用范围 | 含结构门禁 / 仅重 runner | 仅重 runner（compile/test/lint） | 结构门禁廉价且依赖任务上下文，永远新鲜执行 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: check 门禁 95% 时延在测试套件（51.9s），而 dogfooding 循环中大量 check 属「代码范围无变更」的重复过门（rules/backlog/docs/簿记改动），每次都付全量成本。
- 目标: 代码范围字节级无变更时复用上次绿色 check 的重 runner 判定，把此类 check 从 ~52s 降到秒级；代码变更自动回落全量，门禁强度不变。
- 可选方案:
  - 方案 A: scope 内容 digest 缓存（本方案）——命中精确到字节，跨提交稳定，fail-safe 回落全量
  - 方案 B: 测试套件内部提速（spawn 精简/超时治理）——收益真实但属大重构，周期长
  - 方案 C: 全量 check 永远全跑（现状）——无风险但持续浪费
- 推荐方案: 方案 A（B 另立条目不混入本任务）
- 决策理由: A 改动面小、可单测、缓存判定源自真实全量绿；门禁不放宽（命中前提=字节级一致 + 上次绿色全量证据）。
- 不做什么: 不改 check 失败判定语义；不给 lite/降档产物发缓存资格；不做套件内部提速。
- 成本: 中等（约 250 行含测试）
- 风险: digest 覆盖面遗漏（如未来新增构建配置路径）——已覆盖 src/tests/scripts/package.json/lock/tsconfig/tsup.config；结构性配置变更会经 status 变化进入 digest。
- 回滚方案: --no-cache 立即禁用；或 revert 本任务提交恢复全量语义。
- 用户确认: 2026-09-11 会话用户批准 R-331 优先级与条目内容（「同意，#2>#1+#3>#4>#7」），条目验收明确包含「check 结果缓存（未触及 src 跳过全量构建）」；实现细节（内容寻址 digest）为该确认范围的工程化落法。

## 5. 验收标准

- [ ] AC-1: 1) tests/check-cache.test.mjs：digest 稳定性三态断言 + 跨提交不变 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。
- [x] AC-2: 生成的 spec 可直接进入 `docpath plan`（plan 已生成并通过 go 认领）
- [x] AC-3: backlog 条目 R-331 与任务 T-20260911-check-init-sqlite 建立双向关联（promote 完成）

---

*此文件由 `docpath backlog promote` 生成，R-331 会话补全重大变更门禁。*
