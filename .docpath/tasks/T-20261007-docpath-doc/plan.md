## 执行计划

### S1: 实现并验证 FR-1 `docpath doc` 默认导航大盘优化 —— 运行无参数 `docpath doc` 时呈现高信号活文档中心看板（核心架构、活文档分类概览、健康体检状态、常用命令直达），支持 `--agent` 与 `--json`；保留 `docpath doc list` / `--list` 的平铺列表能力。
- [x] S1: 实现并验证 FR-1 `docpath doc` 默认导航大盘优化 —— 运行无参数 `docpath doc` 时呈现高信号活文档中心看板（核心架构、活文档分类概览、健康体检状态、常用命令直达），支持 `--agent` 与 `--json`；保留 `docpath doc list` / `--list` 的平铺列表能力。
- **描述**: 落地 FR-1: `docpath doc` 默认导航大盘优化 —— 运行无参数 `docpath doc` 时呈现高信号活文档中心看板（核心架构、活文档分类概览、健康体检状态、常用命令直达），支持 `--agent` 与 `--json`；保留 `docpath doc list` / `--list` 的平铺列表能力。，并完成模块定向自验。
- **验收条件**: AC-1: 运行 `docpath doc` 呈现高信号文档中心看板，显示核心架构、分类文档库与常用引导，支持 `--agent` 与 `--json`。
- **依赖**: 无

### S2: 实现并验证 FR-2 `docpath doc arch` 架构大盘精准去噪 —— 修正 `inferDocumentTier` 与 `docsArch` 分类逻辑，彻底排除 `tasks/` 与 `backlog/` 临时任务文档误判为 core/arch，并消除板块间重复项。
- [x] S2: 实现并验证 FR-2 `docpath doc arch` 架构大盘精准去噪 —— 修正 `inferDocumentTier` 与 `docsArch` 分类逻辑，彻底排除 `tasks/` 与 `backlog/` 临时任务文档误判为 core/arch，并消除板块间重复项。
- **描述**: 落地 FR-2: `docpath doc arch` 架构大盘精准去噪 —— 修正 `inferDocumentTier` 与 `docsArch` 分类逻辑，彻底排除 `tasks/` 与 `backlog/` 临时任务文档误判为 core/arch，并消除板块间重复项。，并完成模块定向自验。
- **验收条件**: AC-2: 运行 `docpath doc arch` 不包含 `tasks/` 历史任务伪核心项，且条目无跨板块重复。
- **依赖**: S1

### S3: 实现并验证 FR-3 `docpath doc trace` 关联精度与噪声治理 —— 过滤通用停用词标签匹配，按相关度排序并限制高置信度推荐展示（前 6~8 篇），超量折叠并提示精准检索。
- [x] S3: 实现并验证 FR-3 `docpath doc trace` 关联精度与噪声治理 —— 过滤通用停用词标签匹配，按相关度排序并限制高置信度推荐展示（前 6~8 篇），超量折叠并提示精准检索。
- **描述**: 落地 FR-3: `docpath doc trace` 关联精度与噪声治理 —— 过滤通用停用词标签匹配，按相关度排序并限制高置信度推荐展示（前 6~8 篇），超量折叠并提示精准检索。，并完成模块定向自验。
- **验收条件**: AC-3: 运行 `docpath doc trace` 对常见文件不产生泛化标签刷屏，展示精准的高置信度关联列表。
- **依赖**: S2

### S4: 实现并验证 FR-4 `docpath doc <kw>` 搜索排序增强 —— 搜索与推荐优先展示 `docs/`、`rules/`、`AGENTS.md`、`README.md` 与当前活跃任务，降低已完成历史任务权重。
- [x] S4: 实现并验证 FR-4 `docpath doc <kw>` 搜索排序增强 —— 搜索与推荐优先展示 `docs/`、`rules/`、`AGENTS.md`、`README.md` 与当前活跃任务，降低已完成历史任务权重。
- **描述**: 落地 FR-4: `docpath doc <kw>` 搜索排序增强 —— 搜索与推荐优先展示 `docs/`、`rules/`、`AGENTS.md`、`README.md` 与当前活跃任务，降低已完成历史任务权重。，并完成模块定向自验。
- **验收条件**: AC-4: 运行 `docpath doc <kw>` 优先排序核心活文档与系统设计文档。；AC-5: 定向测试与全量测试套件全部通过。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
