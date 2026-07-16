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

## anti-pattern: 绝不用 symlink 替换 git-tracked 目录——合并回主干会删除该目录
- rationale: R-271 把 tracked 的 .docpath/backlog 强制换成指向 main 的 symlink, git 将其记为'整目录文件删除 + 新增 symlink blob'; agent 惯用 add -A / worktree merge FR-2 自动提交把删除记入提交, 合回 main 后 backlog 全删且 .docpath/backlog 成悬空 symlink (P0, R-273 复现)。
触发: 想在 worktree/副本间'实时共享'某个已被 git track 的目录。期望行为: tracked 目录只能走 merge-mediated 拷贝副本 (worktree create 已有 tracked→cp 分支); 只有 untracked 资源可 symlink。若确需 live-share tracked 目录, 必须先 git rm --cached + gitignore 使其 untracked (这本身是数据契约变更, 需用户确认)。边界: doctor 应对'tracked 路径上的 symlink'报 FAIL 引导 repair。
### Evidence
- R-273 分析 .docpath/backlog/analysis/R-273-analysis.md
- src/commands/worktree.ts checkBacklogContract
- tests/worktree.test.mjs '合并回 main 不删 backlog' 回归

## gotcha: state.started_at 是 phase 开始时间 (每次 phase 转移刷新), 不是任务开始时间——任务级锚点必须用 canonical breadcrumb 首条时间
- rationale: transitions.ts 在 phase 变化时 next.started_at = nowIso()。R-276 收口自证时, review.failed 转移把锚点推到实现提交之后, 任务累计 diff 被静默清空 (write-review-skill 构建零需求)。任何把 started_at 当任务起点的消费方都会在 check/review 失败等转移后覆盖面缩水。
触发: 需要'任务开始以来'语义的时间锚 (累计 diff、任务内提交、耗时统计)。期望行为: 用 resolveTaskStartedAt (review-skill-router.ts)——canonical tasks/<id>/breadcrumb.jsonl 首条时间戳, 缺失回退 state.started_at; 不要直接读 state.started_at。边界: phase 级语义 (当前阶段耗时) 用 state.started_at 反而正确; canonical breadcrumb 不存在的 quick/手工工作区走回退。
### Evidence
- src/engine/transitions.ts:322-324 phase 变化刷新 started_at
- src/utils/review-skill-router.ts resolveTaskStartedAt
- tests/review-task-scope.test.mjs 'task anchor survives phase transitions'
