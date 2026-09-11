---
id: R-331
title: check 门禁时延优化：结果缓存/增量执行 + init 用例 sqlite 竞态隔离（同根）
status: done
priority: P1
level: 2
source: docpath backlog capture
readiness: confirmed
evidence:
  brainstorm: null
  analysis: .docpath/backlog/analysis/R-331-analysis.md
  spec: tasks/T-20260911-check-init-sqlite/spec.md
  decision_brief: >-
    - 当前问题: check 门禁 95% 时延在测试套件（51.9s），而 dogfooding 循环中大量 check
    属「代码范围无变更」的重复过门（rules/backlog/docs/簿记改动），每次都付全量成本。

    - 目标: 代码范围字节级无变更时复用上次绿色 check 的重 runner 判定，把此类 check 从 ~52s
    降到秒级；代码变更自动回落全量，门禁强度不变。

    - 可选方案:
      - 方案 A: scope 内容 digest 缓存（本方案）——命中精确到字节，跨提交稳定，fail-safe 回落全量
      - 方案 B: 测试套件内部提速（spawn 精简/超时治理）——收益真实但属大重构，周期长
      - 方案 C: 全量 check 永远全跑（现状）——无风险但持续浪费
    - 推荐方案: 方案 A（B 另立条目不混入本任务）

    - 决策理由: A 改动面小、可单测、缓存判定源自真实全量绿；门禁不放宽（命中前提=字节级一致 + 上次绿色全量证据）。

    - 不做什么: 不改 check 失败判定语义；不给 lite/降档产物发缓存资格；不做套件内部提速。

    - 成本: 中等（约 250 行含测试）

    - 风险: digest 覆盖面遗漏（如未来新增构建配置路径）——已覆盖
    src/tests/scripts/package.json/lock/tsconfig/tsup.config；结构性配置变更会经 status
    变化进入 digest。

    - 回滚方案: --no-cache 立即禁用；或 revert 本任务提交恢复全量语义。

    - 用户确认: 2026-09-11 会话用户批准 R-331 优先级与条目内容（「同意，#2>#1+#3>#4>#7」），条目验收明确包含「check
    结果缓存（未触及 src 跳过全量构建）」；实现细节（内容寻址 digest）为该确认范围的工程化落法。
  user_confirmed: 2026-09-11 会话用户批准 R-331
    优先级与条目内容（「同意，#2>#1+#3>#4>#7」），条目验收明确包含「check 结果缓存（未触及 src 跳过全量构建）」；实现细节（内容寻址
    digest）为该确认范围的工程化落法。
links:
  task: T-20260911-check-init-sqlite
  spec: tasks/T-20260911-check-init-sqlite/spec.md
created_at: 2026-09-11
---

## 背景

【实测定性 2026-09-11，见 analysis】时延构成：tsc 1.5s + tsup ~1s + node --test 全量套件 51.9s（95%）。sqlite 竞态前提已修正：f75543e（9/10 21:54）已落地 DOCPATH_REGISTRY_DB 进程级隔离，4 个 spawn init 的测试文件全部隔离，今日全量套件 2 次全绿。主交付改为 scope 缓存：代码范围（src/tests/构建配置）digest 与上次绿色 check 一致时复用重 runner 判定，结构门禁照跑，--no-cache 逃逸，fail-safe 到慢不放水。

## 验收

1) tests/check-cache.test.mjs：digest 稳定性三态断言 + e2e（全量绿→docs 变更命中缓存→src 变更回落全量）；2) last-check.json 落 code_scope_digest/cached 字段；3) 未触及 src 的变更二次 check 时延显著下降（对照数字记入任务结果，基线 51.9s）；4) 代码变更路径仍付全量、门禁不放宽；5) 全量套件全绿。
