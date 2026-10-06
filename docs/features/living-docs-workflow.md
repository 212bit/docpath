---
title: DocPath 活文档防腐与 Agent 协议联动系统
kind: feature
scope: docs
level: 2
status: active
tier: core
is_core: true
tags:
  - docs
  - agent-protocol
  - context-injection
  - review
  - reveal
summary: 阐述 DocPath 活文档资产的防腐机制、Agent 协议智能上下文注入、Review 代码文档同步提醒与一键 Reveal 直达链路。
---

# DocPath 活文档防腐与 Agent 协议联动系统

## 1. 问题背景与动机 (Motivation)

在传统软件研发与 AI Agent 协同开发中，文档与代码经常面临以下痛点：
1. **文档腐化与脱节**：代码迭代频繁，但活文档（如架构说明、模块设计、API 契约）常常遗漏同步，导致新加入的 Agent 或工程师被过时文档误导。
2. **上下文检索成本高**：Agent 在启动任务或执行步骤时，若缺乏针对性的上下文指引，容易进行全仓大范围漫游检索，浪费 Context Token 并引入噪声。
3. **缺乏主动同步闭环**：代码审查阶段没有对“核心代码变动却未改动文档”进行结构化提示。

## 2. 核心联动架构 (Architecture)

DocPath 建立了从“上下文发现”到“审查提醒”再到“一键直达”的活文档联动闭环：

```mermaid
flowchart TD
    A[Agent 启动任务 / 查看状态\ndocpath next --agent] -->|智能上下文注入| B(relevant_docs 推荐最相关文档 & recommended_reveal)
    B -->|一键直达| C[docpath reveal --topic &lt;kw&gt; --level 1\n获取紧凑结构化上下文]
    C -->|迭代开发代码| D[src/ 核心代码修改]
    D -->|代码审查| E[docpath review\n触发 docs-sync 提示]
    E -->|文档健康自愈| F[docpath docs doctor / docpath docs fix\n刷新 docs-index.json 索引]
    F -->|收口门禁| G[docpath done --commit / step-pass --commit]
```

### 2.1 智能上下文推荐 (`relevant_docs`)
在 `docpath next --agent` 和 `docpath status --agent` 输出中，基于当前任务标题、Backlog 关键词及步骤需求，自动计算匹配度最高的活文档（最多 2 条），并直接提供 `recommended_reveal` 命令，使 Agent 零认知负荷获取相关知识。

### 2.2 Review 代码与文档同步提醒 (`[docs-sync]`)
在执行 `docpath review` 时，如果检测到核心代码变更（`src/` 或 `lib/`）且项目存在 `docs/` 资产但当前变更未包含 `docs/`，审查引擎将生成一条 `severity: 'info'` 的 `[docs-sync]` 提示，提醒 Agent 按照 `AGENTS.md` 规范同步更新活文档。

### 2.3 一键 Reveal 直达 (`recommended_reveal`)
在 `docpath doc <kw>` 或 `docpath docs search <kw>` 检索结果中，终端与 `--agent` 视图均附带一键直达指令：
```bash
docpath reveal --topic "<keyword>" --level 1
```
配合 Token 预算机制（`--max-tokens 2000`），实现高密度信息的高效注入。

### 2.4 代码路径与符号跨文件迁移防漂移 (Code & Symbol Migration Anti-Rot)
在 `docpath docs doctor` 与 `docpath docs fix` 中，内置对代码路径与导出符号的自愈修复能力：
1. **源码路径模糊相似度重定向**：当代码文件重命名或移动时，自动通过 Levenshtein 相似度匹配候选源码文件并建议/执行更新。
2. **符号跨文件迁移追踪**：当函数/类型/类在重构中由文件 A 迁移至文件 B 时，自动全局扫描源码导出表并一键将文档中的链接指向新文件。

### 2.5 双向代码-文档架构透视 (`docpath doc trace <file|symbol|kw>`)
DocPath 提供毫秒级代码与活文档、架构决策 (ADRs)、Backlog 及规则的双向透视能力：
```bash
# 透视特定源码文件的关联文档、历史 ADR 与需求血缘
docpath doc trace src/engine/milestone.ts

# 透视特定函数/符号在活文档中的声明与引用
docpath doc trace getMilestoneProgress

# Agent 机器视图
docpath doc trace src/engine/milestone.ts --agent
```
输出包含：
- **Living Docs**: 强关联活文档及匹配依据（正文直接引用、标题/路径匹配、标签关联）；
- **ADRs**: 影响该文件或模块的历史架构决策；
- **Backlog & Tasks**: 关联的历史交付需求与归档任务；
- **Rules**: 适用的系统规范与工程红线。

### 2.6 代码变更与活文档漂移感知 (`docpath doc drift`)
在开发或代码审查阶段，DocPath 可自动探查已修改的源码文件，推断其对应的主要承载活文档，并检测未同步文档的漂移风险：
```bash
# 检测当前工作区变更的代码与文档漂移
docpath doc drift

# Agent 机器视图
docpath doc drift --agent
```
- **风险等级评定**：核心调度引擎/状态机文件（`high`）、业务功能/命令文件（`medium`）、通用工具（`low`）。
- **智能补齐建议**：输出推荐同步维护的文档路径及具体修改指导。

## 3. 验证与门禁 (Verification)
- **单元与集成测试**: `tests/doc-trace-drift.test.mjs`、`tests/doc-command-enhanced.test.mjs`、`tests/docs-lint-command.test.mjs`、`tests/docs-sync.test.mjs`、`tests/docs-fix-command.test.mjs`。
- **文档健康自愈**: `docpath docs fix` 自动检测并修复 frontmatter、标题、死链、代码路径漂移与符号跨文件迁移。
