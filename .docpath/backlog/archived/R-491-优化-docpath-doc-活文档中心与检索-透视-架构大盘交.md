---
id: R-491
title: 优化 docpath doc 活文档中心与检索/透视/架构大盘交互体验
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261007-docpath-doc/spec.md
  decision_brief: >-
    - 当前问题: `docpath doc` 默认看板体验单薄，`doc arch` 存在任务误判噪声，`doc trace`
    存在通用标签刷屏，搜索缺乏核心文档加权

    - 推荐方案: 升级 `docpath doc` 默认看板，优化 `inferDocumentTier` 与 `docsArch` 去噪，收紧
    `doc-trace` 匹配并分页折叠，增强搜索权重

    - 决策理由: 极大提升 Agent 与开发者查找项目活文档与架构规范的效率与信噪比，符合 AGENTS.md 活文档中心定位

    - 用户确认: 已确认
  user_confirmed: 已确认
links:
  task: T-20261007-docpath-doc
  spec: tasks/T-20261007-docpath-doc/spec.md
created_at: 2026-10-07
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: `docpath doc` 默认导航大盘优化 —— 运行无参数 `docpath doc` 时呈现高信号活文档中心看板（核心架构、活文档分类概览、健康体检状态、常用命令直达），支持 `--agent` 与 `--json`；保留 `docpath doc list` / `--list` 的平铺列表能力。
- [x] FR-2: `docpath doc arch` 架构大盘精准去噪 —— 修正 `inferDocumentTier` 与 `docsArch` 分类逻辑，彻底排除 `tasks/` 与 `backlog/` 临时任务文档误判为 core/arch，并消除板块间重复项。
- [x] FR-3: `docpath doc trace` 关联精度与噪声治理 —— 过滤通用停用词标签匹配，按相关度排序并限制高置信度推荐展示（前 6~8 篇），超量折叠并提示精准检索。
- [x] FR-4: `docpath doc <kw>` 搜索排序增强 —— 搜索与推荐优先展示 `docs/`、`rules/`、`AGENTS.md`、`README.md` 与当前活跃任务，降低已完成历史任务权重。

## 范围

### 包含

- 见 linked spec

### 不包含

- 见 linked spec

## 验收

- [x] AC-1: 运行 `docpath doc` 呈现高信号文档中心看板，显示核心架构、分类文档库与常用引导，支持 `--agent` 与 `--json`。
- [x] AC-2: 运行 `docpath doc arch` 不包含 `tasks/` 历史任务伪核心项，且条目无跨板块重复。
- [x] AC-3: 运行 `docpath doc trace` 对常见文件不产生泛化标签刷屏，展示精准的高置信度关联列表。
- [x] AC-4: 运行 `docpath doc <kw>` 优先排序核心活文档与系统设计文档。
- [x] AC-5: 定向测试与全量测试套件全部通过。

## 决策证据

- 当前问题: `docpath doc` 默认看板体验单薄，`doc arch` 存在任务误判噪声，`doc trace` 存在通用标签刷屏，搜索缺乏核心文档加权
- 推荐方案: 升级 `docpath doc` 默认看板，优化 `inferDocumentTier` 与 `docsArch` 去噪，收紧 `doc-trace` 匹配并分页折叠，增强搜索权重
- 决策理由: 极大提升 Agent 与开发者查找项目活文档与架构规范的效率与信噪比，符合 AGENTS.md 活文档中心定位
- 用户确认: 已确认
