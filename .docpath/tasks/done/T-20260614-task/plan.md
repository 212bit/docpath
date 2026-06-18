## 执行计划

### S1: 定位文档索引和空任务路由边界
- **描述**: 梳理 `document-index`、`reveal/context`、`analyze/write-analysis`、`agent-output/next` 的当前行为，确定最小改动点。
- **验收条件**: 明确 generated/index/archive-like 识别规则、topic 统计口径、空任务 fail-loud 条件和 idle next 路由条件。
- **依赖**: 无

### S2: 实现 generated view 分类、降权和预算过滤
- **描述**: 调整文档索引分类/排序/统计与 reveal/context 输出，避免 `docs.md`、legacy 大索引污染 topic 候选和 selected token。
- **验收条件**: generated/archive-like 条目可发现但降权；topic docs 的预算统计不再被大生成视图主导；旧索引可兼容 normalize。
- **依赖**: S1

### S3: 实现空任务 analyze/write-analysis 与 next 路由保护
- **描述**: 在无活跃任务时阻止 `analyze` / `write-analysis` 写入旧 task_id，并让 idle 空任务的 `next --agent` 不再跟随旧 breadcrumb in_progress。
- **验收条件**: completed/idle 无 task 时 fail-loud 并提示 backlog capture/promote；idle 空任务推荐新需求入口。
- **依赖**: S1

### S4: 补齐测试、文档和质量门禁
- **描述**: 增加 docs-index、analyze/write-analysis、next/status 回归测试，更新文档系统边界说明并运行门禁。
- **验收条件**: `pnpm test`、`pnpm run typecheck`、`docpath check`、`docpath review` 通过或记录非阻塞警告。
- **依赖**: S2, S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S4
S1 → S3 → S4
