---
id: R-484
title: 文档扫描引擎默认探测项目根目录 docs 与 README 索引
kind: feature
status: done
priority: P2
level: 2
source: docpath start
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20261004-docs-readme/spec.md
  decision_brief: |-
    - 当前问题: docs scan 默认不扫项目根目录 docs/，导致未显式配置的项目全部业务文档漏索引
    - 目标: 实现 docs scan 智能默认探测 docs/ 与 README.md，并对齐 init 默认模板
    - 推荐方案: 缺省配置时采用 DEFAULT_DOCUMENT_SCAN_PATHS，并更新 init 生成逻辑
    - 决策理由: 符合常识与直觉，开箱即用，彻底解决文档索引漏扫问题
    - 用户确认: 已确认
  user_confirmed: 已确认
links:
  task: T-20261004-docs-readme
  spec: tasks/T-20261004-docs-readme/spec.md
created_at: 2026-10-04
---

## 背景

由 spec.json 渲染生成。

## 功能要点

- [x] FR-1: 文档扫描引擎智能默认探测 —— 当 `config.yaml` 未显式声明 `document_scan_paths` 时，自动使用 `DEFAULT_DOCUMENT_SCAN_PATHS`（默认包含 `.docpath/`, `README.md`, `docs/`），自动扫描并索引项目根目录下的 `docs/` 及 `README.md`。
- [x] FR-2: `docpath init` 配置模板对齐 —— `docpath init` 生成的 `config.yaml` 默认预填 `document_scan_paths`（包含 `.docpath/`, `README.md`, `docs/`），开箱即用。

## 范围

### 包含

- 见 linked spec

### 不包含

- 见 linked spec

## 验收

- [x] AC-1: 在未配置 `document_scan_paths` 的项目中，`docs scan` 自动将项目根目录 `docs/` 下的 Markdown 文档索引进 `docs-index.json`。
- [x] AC-2: `docpath init` 生成的 `config.yaml` 默认包含 `document_scan_paths` 配置。
- [x] AC-3: 全量测试套件通过。

## 决策证据

- 当前问题: docs scan 默认不扫项目根目录 docs/，导致未显式配置的项目全部业务文档漏索引
- 目标: 实现 docs scan 智能默认探测 docs/ 与 README.md，并对齐 init 默认模板
- 推荐方案: 缺省配置时采用 DEFAULT_DOCUMENT_SCAN_PATHS，并更新 init 生成逻辑
- 决策理由: 符合常识与直觉，开箱即用，彻底解决文档索引漏扫问题
- 用户确认: 已确认
