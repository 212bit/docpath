---
id: R-501
title: 修复测试门禁误注入 Node 24+ 专属 flag：--test-isolation 在 Node 22 上必然失败
kind: fix
status: done
priority: P0
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261021-node-24-flag-test-isolation-node-22/spec.md
  decision_brief: >-
    - 当前问题: 测试门禁在 Node 22 上必然失败，原因是两处调用点硬编码了 Node 24 才有的
    `--test-isolation=process`；失败还可能被 check 缓存掩盖。

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

    - 风险: 若 docpath 运行时 Node 与执行测试的 `node` 不同版本，判据可能错位；但省略 flag
    在所有版本均安全，最坏情况只是少一次显式声明，不会失败

    - 回滚方案: 还原两处调用点即可

    - 用户确认: 用户在 2026-10-21 会话中同意先修此门禁缺陷再进 P2
  user_confirmed: 用户在 2026-10-21 会话中同意先修此门禁缺陷再进 P2
links:
  task: T-20261021-node-24-flag-test-isolation-node-22
  spec: tasks/T-20261021-node-24-flag-test-isolation-node-22/spec.md
created_at: 2026-10-21
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 以 Node 主版本为判据解析隔离 flag，并让两处调用点共用同一实现

## 范围

### 包含

- `src/engine/test-scope.ts`、`src/engine/step-verify.ts`
- 新增单测文件

### 不包含

- 修改 Node 版本探测机制（仍以运行 docpath 的 Node 为准）
- 处理其他 Node 版本差异导致的 flag 兼容问题
- 调整 check 缓存策略（缓存掩盖失败属独立议题）

## 验收

- [x] AC-1: Node 22.x 下不注入 `--test-isolation`，Node 24/26 下注入；非法版本号不抛异常且不注入
- [x] AC-2: `opts.isolation === false` 时无论版本均不注入
- [x] AC-3: `test-scope` 与 `step-verify` 两处均调用同一解析函数，仓库内不再出现硬编码的 `--test-isolation=process` 字面量
- [x] AC-4: 新增单测覆盖 22 / 24 / 26 / 非法版本 / isolation=false 五种输入并通过
- [x] AC-5: Node 22.22.2 下 `docpath check` 的测试项恢复正常通过

## 决策证据

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
