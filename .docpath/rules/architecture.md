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

## gotcha: config.yaml 与 config.json 是两个不互通的配置真源，init 只写 yaml
- rationale: readDocPathConfig 只读 .docpath/config.json，而 init 生成的项目配置落在 .docpath/config.yaml；只接 json 读取器的新字段永远看不到 init 写入的值 (S5 的 readDocumentScanPaths 即踩此坑)。
触发: 新增由 init 写入且运行时消费的 config 字段。期望行为: 消费方优先用 parse (yaml 包) 读 config.yaml (idiom 见 quick-guard.ts/project-registry.ts)，需要兼容时回退 config.json。边界: 既有 artifacts/review_skill_gate 等 json 字段维持现状。
### Evidence
- src/utils/config.ts readDeclaredDocumentScanPaths yaml 优先 json 回退
- src/commands/init.ts generateConfig 写 config.yaml
