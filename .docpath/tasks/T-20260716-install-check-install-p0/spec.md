# T-20260716-install-check-install-p0 - install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作

> backlog_id: R-279
> backlog_source: docpath backlog capture

## 1. 背景与动机

R-277 实证 (2026-07-17): 本地 CLAUDE.md 承载 R-269/R-273 用户确认修正, 模板是
R-271 致 P0 旧契约; install --check 只报"本地改动 1 项", install_health 自
2026-07-10 长红, recommended_command=docpath install 若被执行会用旧模板覆盖修正。
机制: countLocalAssetDrift 只比 local vs manifest sha; detectInstallAssetDrift
已渲染出模板 expected sha——三方判定材料齐全, 只缺分类与方向化建议。

## 2. 需求清单

### 功能需求
- [x] FR-1: modifiedLocal 逐项三方向分类 (local/expected/manifest 三方 sha): local==expected → manifest_stale (重装仅刷新记录, 无覆盖风险); local≠expected 且 expected==manifest → local_ahead (模板未动本地领先, 直接重装会覆盖丢失); 双不等或模板已不产出该资产 → diverged (人工比对合并)。三类互斥且并集=modifiedLocal, 报告字段 append-only。
  - 来源 backlog: R-279
- [x] FR-2: install --check 失败输出按方向分组列出文件与各自处置; 存在 local_ahead/diverged 时总建议改为"先回灌/合并再 install --force", 不再一律推荐覆盖式重装。
- [x] FR-3: install_health/doctor 的 recommended_command 方向化——存在 local_ahead/diverged 时给只读诊断入口 docpath install --check, message 附方向计数与覆盖警示; 否则维持 install 建议。
- [x] FR-4: AGENTS.md 等豁免资产维持现状 (不进 modifiedLocal, 不受本条影响)。

### 非功能需求
- [x] NFR-1: 与现有安装/检查流程兼容 (既有 31 条 install 用例迁移 1 条断言后全部回归)

## 3. 范围界定

### 包含
- src/utils/install-core.ts (三方分类 + doctor 建议方向化)
- src/commands/install.ts (check 失败输出分组)
- tests/install.test.mjs (断言迁移 + 3 条方向用例)

### 不包含
- install --force 对豁免资产覆写行为 (R-278)
- 自动回灌/三方合并实现 (仅诊断与建议)
- doctor 其余检查项改造

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 危险方向的 recommended_command | 只读诊断入口 / 覆盖式 install / 空值 | docpath install --check | 保持字段恒为可执行命令 (消费方契约); check 输出自带逐文件处置, 覆盖警示放 message |

## 4.1 重大变更门禁
### 是否涉及重大变更
- [x] 否 (诊断输出与建议命令的精化, 不改安装写入行为/契约; install 路径不在策略文件清单)

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 用户确认: 2026-07-17 用户回顾后指示"捕获，并且推进它"——R-279 为回顾报告中我方标注的最高优先级项 (危险推荐命令), 修法方向 (三方判定+方向化建议) 已写入回顾与 backlog 正文。

## 5. 验收标准

- [x] AC-1: 三种方向的工作区分别输出方向标签与对应建议; local_ahead 输出含回灌警示且不出现覆盖式建议 (tests/install.test.mjs 3 条新用例)。
- [x] AC-2: install --doctor --json 在 local_ahead 场景 recommended_command='docpath install --check', message 含"本地领先 1 项"与覆盖警示。
- [x] AC-3: pnpm test 全绿 (647/647)。
- [x] AC-4: R-277 修复后的当前仓库 install --check 仍通过 (141 assets, 无回归)。

---

*此文件由 `docpath backlog promote` 生成。*
