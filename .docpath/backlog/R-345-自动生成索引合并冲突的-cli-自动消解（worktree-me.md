---
id: R-345
title: 自动生成索引合并冲突的 CLI 自动消解（worktree merge 增强）
status: proposed
priority: P2
level: 2
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: R-344 收口实战发现（会话内 Decision Brief，2026-09-12）
  user_confirmed: 用户于 2026-09-12 会话中明确引用改进建议并要求捕获
links:
  task: null
  spec: null
created_at: 2026-09-12
---

# Decision Brief: 自动生成索引的合并冲突自动消解（worktree merge 收口增强）

## 背景

R-344 收口时，worktree merge 在共享索引文件 `docs-index.json` / `backlog.md` 上发生内容冲突（两侧都是自动刷新的索引），只能手工解决（取任一侧 + `docpath backlog refresh` / `docpath docs --scan` 重建）。这类文件的内容永远可以由 CLI 确定性地重建，冲突是纯噪音，不应消耗人工/agent 注意力。

## 方向

- 在 `worktree merge` 的两个合并环节（同步方向 main→branch、收口方向 branch→main）检测到冲突时，先判断冲突文件是否全部属于"可重建索引集合"（初始为 `.docpath/docs-index.json`、`.docpath/backlog/backlog.md`；集合可 config 扩展）。
- 若是：取任一侧（保留暂存区结构），执行对应重建命令（backlog refresh / docs --scan），`git add` 后继续合并流程；输出自动消解审计行。
- 若冲突文件含不可重建文件：维持现有行为（列冲突、退出、WT-1 abort 保护）。
- 同步方向（main→branch）冲突目前无 abort 保护（WT-1 只覆盖主仓环节）——本包顺带把 WT-1 的检测/恢复逻辑同样应用到同步方向。

## 边界

- 不改索引重建命令本身的语义；只做冲突检测后的调度。
- 可重建集合初始内置两项，`.docpath/config.yaml` 预留 `worktree.auto_resolve_paths:` 扩展（风格沿用 risk:/quick: 块）。
- 不做正文类 markdown（backlog 条目文件本身）的自动消解——那些不是可再生索引。

## 验收

- AC-1: 构造 docs-index.json / backlog.md 双侧冲突的合并，worktree merge 自动消解并完成合并，输出审计行；有集成测试。
- AC-2: 冲突含不可重建文件时不自动消解，行为与现状一致；有测试。
- AC-3: 同步方向（main→branch）冲突同样获得检测/恢复保护（WT-1 逻辑推广）；有测试。
- AC-4: 全量测试通过，docpath check 通过。
