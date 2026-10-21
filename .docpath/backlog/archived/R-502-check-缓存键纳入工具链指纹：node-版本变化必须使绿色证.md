---
id: R-502
title: check 缓存键纳入工具链指纹：Node 版本变化必须使绿色证据失效
kind: fix
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261021-check-node/spec.md
  decision_brief: |-
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
  user_confirmed: 用户在 2026-10-21 会话中同意先做缓存键工具链指纹，再做 P2 门禁合一
links:
  task: T-20261021-check-node
  spec: tasks/T-20261021-check-node/spec.md
created_at: 2026-10-21
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 把工具链指纹纳入 check 缓存键，并落盘以便诊断

## 范围

### 包含

- `src/commands/check/cache.ts`、`src/utils/workspace-evidence.ts`、`src/commands/check/evidence.ts`
- 新增单测

### 不包含

- 编译器/解释器版本探测（如 tsc、gcc 版本）
- 依赖树指纹（lockfile 已在 scope 路径内）
- 缓存失效原因的 UI 展示（仅落盘字段）

## 验收

- [x] AC-1: 同一工具链指纹下 digest 稳定，不同指纹（仅 node 版本不同）下 digest 必然不同
- [x] AC-2: `last-check.json` 写出 `toolchain` 字段，且值与 `computeToolchainFingerprint()` 一致
- [x] AC-3: 分门类 digest 与全量 digest 都包含指纹前缀（两条缓存路径都不漏）
- [x] AC-4: 非 git 仓仍返回 `null`，`tryReuse*` 回落全量的语义不变
- [x] AC-5: 新增单测通过，Node 22 下既有 check 测试不回归

## 决策证据

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
