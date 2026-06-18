# DocPath Architecture Rules

## 上下文架构

- `.docpath/rules/style.md` 和 `.docpath/rules/architecture.md` 是 preferred 规则真源；`.docpath/spec/style.md` 和 `.docpath/spec/architecture.md` 仅作 legacy fallback。
- `.docpath/docs-index.json` 是导航索引，负责 path、scope、summary、token_estimate、default_read、archive、task_id 和 topic_tags；正文仍以原 Markdown 文件为真源。
- 当前任务优先读取 `.docpath/tasks/current/*`；canonical task 目录用于持久化和追溯，不应在默认上下文中重复展开。
- 历史任务、journal、decisions 和模板属于归档/参考层，默认不作为正文进入上下文。

## 工作流边界

- 不手改 `.docpath/workspace/current.md`；状态迁移必须通过 DocPath 生命周期命令完成。
- 代码或规则变更涉及 Agent 默认行为时，需要在 spec 中记录重大变更确认和回滚方式。
- 预算门禁先以 warning 收集误报；缺失当前任务 spec/plan、损坏索引、明确规则真源冲突可以阻塞。
