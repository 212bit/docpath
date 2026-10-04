# T-20261004-docs-readme - 文档扫描引擎默认探测项目根目录 docs 与 README 索引

> backlog_id: R-484
> backlog_source: docpath start

## 1. 背景与动机

在真实项目使用中，用户项目通常在根目录下存放大量文档（如 `docs/*.md` 和 `README.md`）：
1. 之前的设计中，`readDeclaredDocumentScanPaths` 在未显式配置 `document_scan_paths` 时返回 `null`，导致 `docs scan` 默认仅扫描 `.docpath/`，彻底忽略了根目录下 `docs/` 里的所有 Markdown 文档；
2. 导致 `docpath doc <keyword>` 搜索不到项目业务与架构文档，Agent 产生“引擎坏了”的误解；
3. 需要将文档扫描引擎升级为智能默认探测，并在 `docpath init` 生成配置时默认包含标准扫描路径。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 文档扫描引擎智能默认探测 —— 当 `config.yaml` 未显式声明 `document_scan_paths` 时，自动使用 `DEFAULT_DOCUMENT_SCAN_PATHS`（默认包含 `.docpath/`, `README.md`, `docs/`），自动扫描并索引项目根目录下的 `docs/` 及 `README.md`。
- [ ] FR-2: `docpath init` 配置模板对齐 —— `docpath init` 生成的 `config.yaml` 默认预填 `document_scan_paths`（包含 `.docpath/`, `README.md`, `docs/`），开箱即用。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容，全量测试套件通过。

## 4.1 重大变更门禁

### Decision Brief
- 当前问题: docs scan 默认不扫项目根目录 docs/，导致未显式配置的项目全部业务文档漏索引
- 目标: 实现 docs scan 智能默认探测 docs/ 与 README.md，并对齐 init 默认模板
- 推荐方案: 缺省配置时采用 DEFAULT_DOCUMENT_SCAN_PATHS，并更新 init 生成逻辑
- 决策理由: 符合常识与直觉，开箱即用，彻底解决文档索引漏扫问题
- 用户确认: 已确认

## 5. 验收标准

- [ ] AC-1: 在未配置 `document_scan_paths` 的项目中，`docs scan` 自动将项目根目录 `docs/` 下的 Markdown 文档索引进 `docs-index.json`。
- [ ] AC-2: `docpath init` 生成的 `config.yaml` 默认包含 `document_scan_paths` 配置。
- [ ] AC-3: 全量测试套件通过。
