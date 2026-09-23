# T-20260923-install-doctor-npm-link - install --doctor 在 npm-link 自引用场景下增加漂移说明

> backlog_id: R-361

## 1. 背景与动机

docpath 通过 npm-link 指向自身 checkout 时，改模板会使所有受管项目都报 install-manifest-drift。这是必然复发的结构性约束（不是项目坏了），但 --doctor 输出没有解释这一点，容易误判为项目损坏。

## 2. 需求清单

### 功能需求
- [x] FR-1: install --doctor 检测到 docpath 的 npm-link 目标等于当前工作目录（自引用）时，在漂移报告末尾追加说明：模板修改后的 manifest 漂移为预期行为，请在各受管项目执行 docpath install --force 同步
- [x] FR-2: 仅在确属自引用场景才追加说明，不污染普通项目的 doctor 输出

### 非功能需求
- [x] NFR-1: 不修改既有漂移判定逻辑

## 3. 范围界定

### 包含
- runInstallDoctor / buildInstallDoctorReportFromContext 增加自引用检测（解析 bin/docpath.js 指向，比对 cwd）

### 不包含
- 自动修复漂移

## 4. 关键决策

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 检测方式 | 解析 bin/docpath.js symlink / 真实路径，与 cwd 比对 | 轻量、无副作用 |

## 5. 验收标准

- [x] AC-1: 自引用场景下 doctor 输出含「npm-link 自引用，漂移为预期」说明
- [x] AC-2: 非自引用项目 doctor 输出不变
