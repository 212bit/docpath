# Spec: Phase 3 — Agent Superpowers (借鉴 Superpowers / Trellis / GSD)

> Task ID: T-20260529-p3
> Status: design_approved
> Created: 2026-05-29
> Depends on: T-20260528-harness-lite (已完成), T-20260528-p2 (P0/P1 已完成)

## 1. Problem

DocPath P0/P1 已完成（state.json 单源、breadcrumb 结构化、verification 门禁、归档自动完成）。但从 Superpowers/Trellis/GSD 三方分析中发现 9 项优化尚未实现：

| # | 优化 | 来源 | 优先级 | 当前状态 |
|---|------|------|--------|----------|
| 1 | TDD Skill（spec→plan→act 循环） | Superpowers | P0 | ❌ 无 |
| 2 | context-compaction（上下文压缩/恢复） | Trellis | P0 | ❌ 无 |
| 3 | AI 纪律（pre-action checklist、continuation protocol） | Superpowers | P1 | ❌ 无 |
| 4 | Progressive Disclosure（只暴露当前状态+下一步） | Harness | P1 | ❌ 无 |
| 5 | 可选归档（journal 是否归档可配置） | GSD | P1 | ❌ 硬编码 false |
| 6 | Parallel Agent Dispatch（多 agent 并行） | Superpowers | P2 | ❌ 无 |
| 7 | Agent Discovery（发现项目已有命令） | Harness | P2 | ❌ 无 |
| 8 | Agent Runtime Hooks（run-start / run-end / state-recovery） | Trellis | P2 | ❌ 无 |
| 9 | Context Packs（部分 spec 加载） | Trellis | P2 | ❌ 无 |

## 2. Goal

Phase 3 实现 #1-#5（P0+P1），共 5 项改进，使 DocPath 达到"agent 纪律强化"水平。

验收标准：
- 所有改动通过 typecheck / build / docpath check
- 每项改进有 E2E 验证路径
- 与现有 Harness Lite 和 P0/P1 功能无冲突

## 3. Non-Goals（Phase 3 不做）

- #6 Parallel Agent Dispatch — 需要 worker 调度框架，复杂度高
- #7 Agent Discovery — 需要跨语言脚本发现，scope 大
- #8 Agent Runtime Hooks — 需要 agent 集成层，属于 Phase 4
- #9 Context Packs — 需要 spec 分块机制，属于 Phase 4
