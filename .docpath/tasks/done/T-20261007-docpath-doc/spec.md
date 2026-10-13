# T-20261007-docpath-doc - 优化 docpath doc 活文档中心与检索/透视/架构大盘交互体验

> backlog_id: R-491
> backlog_source: docpath start

## 1. 背景与动机

`docpath doc`（及其全称 `docpath docs`）是 DocPath 面向 AI Agent 与人类开发者的活文档资产管理与瞬时索引中心。
在日常高频开发与 Agent 零点击上下文中，存在以下交互与精准度痛点：

1. **默认无参看板信号弱**：直接运行 `docpath doc` 时默认调用 `docsList`，仅输出总量与 10 篇主要来自 `tasks/T-*` 的历史任务，缺乏项目架构、分类文档库、体检状态与操作引导的全局视野；
2. **`docpath doc arch` 架构大盘存在噪声与重复**：`inferDocumentTier` 将标题或目录含 "arch"/"design"/"rule" 的历史任务误判为 core/arch 文档，且分类过滤条件重叠导致同一文档（如 `rules/architecture.md`）在多个板块重复出现；
3. **`docpath doc trace` 泛化标签误命中**：代码-文档双向透视引擎在提取文件名关键词（如 "index"、"doc"）后，与全部包含该通用标签的文档产生低置信度弱关联，导致一次性输出数十篇无关文档刷屏；
4. **`docpath doc <kw>` 检索排序需优化**：搜索结果中历史任务 specs 占比过高，缺乏对系统核心架构文档（`docs/*`、`rules/*`、`AGENTS.md`）的优先加权。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath doc` 默认导航大盘优化 —— 运行无参数 `docpath doc` 时呈现高信号活文档中心看板（核心架构、活文档分类概览、健康体检状态、常用命令直达），支持 `--agent` 与 `--json`；保留 `docpath doc list` / `--list` 的平铺列表能力。
- [ ] FR-2: `docpath doc arch` 架构大盘精准去噪 —— 修正 `inferDocumentTier` 与 `docsArch` 分类逻辑，彻底排除 `tasks/` 与 `backlog/` 临时任务文档误判为 core/arch，并消除板块间重复项。
- [ ] FR-3: `docpath doc trace` 关联精度与噪声治理 —— 过滤通用停用词标签匹配，按相关度排序并限制高置信度推荐展示（前 6~8 篇），超量折叠并提示精准检索。
- [ ] FR-4: `docpath doc <kw>` 搜索排序增强 —— 搜索与推荐优先展示 `docs/`、`rules/`、`AGENTS.md`、`README.md` 与当前活跃任务，降低已完成历史任务权重。

### 非功能需求
- [ ] NFR-1: 兼容已有 CLI 参数与 Agent YAML 输出契约，全量测试套件通过。

## 4.1 重大变更门禁

### Decision Brief
- 当前问题: `docpath doc` 默认看板体验单薄，`doc arch` 存在任务误判噪声，`doc trace` 存在通用标签刷屏，搜索缺乏核心文档加权
- 推荐方案: 升级 `docpath doc` 默认看板，优化 `inferDocumentTier` 与 `docsArch` 去噪，收紧 `doc-trace` 匹配并分页折叠，增强搜索权重
- 决策理由: 极大提升 Agent 与开发者查找项目活文档与架构规范的效率与信噪比，符合 AGENTS.md 活文档中心定位
- 用户确认: 已确认

## 5. 验收标准
- [ ] AC-1: 运行 `docpath doc` 呈现高信号文档中心看板，显示核心架构、分类文档库与常用引导，支持 `--agent` 与 `--json`。
- [ ] AC-2: 运行 `docpath doc arch` 不包含 `tasks/` 历史任务伪核心项，且条目无跨板块重复。
- [ ] AC-3: 运行 `docpath doc trace` 对常见文件不产生泛化标签刷屏，展示精准的高置信度关联列表。
- [ ] AC-4: 运行 `docpath doc <kw>` 优先排序核心活文档与系统设计文档。
- [ ] AC-5: 定向测试与全量测试套件全部通过。
