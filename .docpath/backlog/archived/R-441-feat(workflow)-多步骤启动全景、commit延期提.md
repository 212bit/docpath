---
id: R-441
title: "feat(workflow): 多步骤启动全景、commit延期提示、单步arch守卫与FR智能拆解增强"
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260929-feat-workflow-commit-arch-fr/spec.md
  decision_brief: |-
    - 当前问题: 多步骤启动缺乏全貌透出、中间态 commit 缺乏延期提示、单步交接缺乏增量 arch 守卫、Backlog 复合序号格式提取不全。
    - 目标: 落地 4 项工作流效能增强：
      1. FR-1: `docpath start` 冷启动透出步骤拓扑全景与推进提示；
      2. FR-2: `step-pass --commit` 在非终步输出显式的延迟提交反馈；
      3. FR-3: `step-pass` 单步交接集成轻量架构分层防腐巡检；
      4. FR-4: `extractFunctionalRequirements` 支持序号（1./(1)/①）与分号复合语法拆解。
    - 背景: 用户同意推进 4 项优化建议。
    - 可选方案:
      - 方案 A (推荐): 在 start、step-pass、backlog 模块中增量落地 4 项增强，配齐针对性测试。
      - 方案 B: 仅修改提示层，不接入 arch 巡检。
    - 推荐方案: 方案 A
    - 决策理由: 方案 A 既提升了开发者可观测性与操作确定性，又真正实现了「小步快跑 + 每步 arch 兜底」。
    - 不做什么: 不修改底层 FSM 核心流转。
    - 成本: 低，改动量约 80-100 行。
    - 风险: 极低，均为非破坏性增强。
    - 回滚方案: Git revert 提交。
    - 用户确认: 用户已在会话中明确同意推进这 4 项优化。
  user_confirmed: 用户已在会话中明确同意推进这 4 项优化。
links:
  task: T-20260929-feat-workflow-commit-arch-fr
  spec: tasks/T-20260929-feat-workflow-commit-arch-fr/spec.md
created_at: 2026-09-29
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 多步骤启动全景
- [x] FR-2: commit延期提示
- [x] FR-3: 单步arch守卫
- [x] FR-4: FR智能拆解增强

## 范围

### 包含

- feat(workflow): 多步骤启动全景、commit延期提示、单步arch守卫与FR智能拆解增强

### 不包含

- 待在后续规划中补充

## 验收

- [x] AC-1: 多步骤启动全景 满足功能要求并通过测试
- [x] AC-2: commit延期提示 满足功能要求并通过测试
- [x] AC-3: 单步arch守卫 满足功能要求并通过测试
- [x] AC-4: FR智能拆解增强 满足功能要求并通过测试
- [x] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [x] AC-6: backlog 条目 R-441 与任务 T-20260929-feat-workflow-commit-arch-fr 建立双向关联

## 决策证据

- 当前问题: 多步骤启动缺乏全貌透出、中间态 commit 缺乏延期提示、单步交接缺乏增量 arch 守卫、Backlog 复合序号格式提取不全。
- 目标: 落地 4 项工作流效能增强：
  1. FR-1: `docpath start` 冷启动透出步骤拓扑全景与推进提示；
  2. FR-2: `step-pass --commit` 在非终步输出显式的延迟提交反馈；
  3. FR-3: `step-pass` 单步交接集成轻量架构分层防腐巡检；
  4. FR-4: `extractFunctionalRequirements` 支持序号（1./(1)/①）与分号复合语法拆解。
- 背景: 用户同意推进 4 项优化建议。
- 可选方案:
  - 方案 A (推荐): 在 start、step-pass、backlog 模块中增量落地 4 项增强，配齐针对性测试。
  - 方案 B: 仅修改提示层，不接入 arch 巡检。
- 推荐方案: 方案 A
- 决策理由: 方案 A 既提升了开发者可观测性与操作确定性，又真正实现了「小步快跑 + 每步 arch 兜底」。
- 不做什么: 不修改底层 FSM 核心流转。
- 成本: 低，改动量约 80-100 行。
- 风险: 极低，均为非破坏性增强。
- 回滚方案: Git revert 提交。
- 用户确认: 用户已在会话中明确同意推进这 4 项优化。
