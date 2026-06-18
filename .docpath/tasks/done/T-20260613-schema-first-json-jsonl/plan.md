## 执行计划

### S1: 梳理 schema 与迁移边界
- **描述**: 明确 JSON/JSONL 真源的 schema version、类型、校验策略、fallback 规则和 CLI 写边界。
- **验收条件**: spec/plan 中记录迁移边界；实现时有统一类型与校验入口。
- **依赖**: 无

### S2: 实现 plan.json 与 spec.json 真源
- **描述**: 为任务计划和规约新增 JSON schema/type/helper，写入或迁移时双写 JSON 与 Markdown，读取时优先 JSON、fallback Markdown。
- **验收条件**: `plan.json`、`spec.json` 可生成、校验、读取；Markdown render 可由 JSON 重建；旧任务继续可读。
- **依赖**: S1

### S3: 实现 breadcrumb.jsonl 事件流
- **描述**: 为执行记录新增 JSONL schema/type/helper，`recordBreadcrumb` 双写 Markdown 与 JSONL，tail/完成度/漂移读取优先 JSONL、fallback Markdown。
- **验收条件**: `breadcrumb.jsonl` 追加 O(1)，可读取最近 N 条，`check/next/agent step` 完成度和漂移逻辑优先读 JSONL。
- **依赖**: S2

### S4: 实现 decisions.jsonl 事件流
- **描述**: 为决策日志新增 JSONL schema/type/helper，`journal/review/gc-decisions` 保留 Markdown render 与轮转，读取优先 JSONL、fallback Markdown。
- **验收条件**: `decisions.jsonl` 可追加、校验、按月轮转兼容；`decisions.md` 可由 JSONL 渲染或继续作为旧任务 fallback。
- **依赖**: S3

### S5: 收敛核心命令读路径与迁移入口
- **描述**: 将 `check/go/next/agent step/journal` 的结构化完成度、tail、漂移和决策读取接入统一 helper，并提供显式迁移/重建路径。
- **验收条件**: 核心命令不再首选解析 Markdown 真源；结构化损坏 fail loud；缺失结构化文件时旧 Markdown fallback 可用。
- **依赖**: S4

### S6: 补充兼容与回归测试
- **描述**: 增加覆盖 plan 重复 checklist、breadcrumb tail、归档后 check、JSON/JSONL 迁移、decisions 轮转和 Markdown render 可重建的测试。
- **验收条件**: 新旧格式测试均通过，覆盖 R-163 验收中的关键兼容场景。
- **依赖**: S5

### S7: 验证门禁并归档
- **描述**: 运行相关测试、`docpath check`、`docpath review`、`docpath journal`，完成任务归档。
- **验收条件**: 质量门禁通过，任务状态进入 completed。
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7
