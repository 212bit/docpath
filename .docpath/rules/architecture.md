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

## common-mistake: 契约/协议文档修正必须全链检索承载面: 本地协议文件+docs+templates+已装副本; install-manifest-drift 长红可能意味着'本地是对的, 模板是旧的'
- rationale: R-273 修正了 CLAUDE.md 与 docs 主体但漏了模板层, 导致 install (CLI 反复推荐的修复命令) 会用致 P0 的 R-271 旧契约覆盖已修正文件; Codex/OpenCODE 根副本继续给会话喂错误契约 (R-271 事故根因模式)。drift 方向不能默认'本地错模板对'。
触发: 修正协议/契约文档 (CLAUDE.md/AGENTS.md/工作流语义), 或诊断 install-manifest-drift。期望行为: 修正时 grep 契约关键词全链——本地根副本、docs/、templates/ (含 templates/protocols/)、.docpath/protocols/; drift 诊断先 diff 判方向: 本地领先 (承载用户确认修正) → 回灌模板 + install --force 刷新; 模板领先 → 才是常规重装。--force 前留 sha 校验关键文件覆写前后一致。边界: AGENTS.md 等豁免资产允许本地定制, 恢复本地版本后 check 仍通过; --force 会覆写豁免资产 (R-278)。
### Evidence
- R-277 analysis .docpath/backlog/analysis/R-277-analysis.md 漂移面清单
- templates/CLAUDE.md option C 原文 vs R-273 裁定 (ADR-20260716-011)
- src/utils/install-core.ts isLocallyCustomizableInstallAsset

## pattern: 契约翻转清扫面必须包含编码契约的代码判定点, 不止文档/模板载体
- rationale: R-273 把 backlog/rules 从 symlink 改为 tracked copy 时, 只清扫了文档/模板层(R-277 教训), 但 src 中两处以 symlink 存在性编码旧契约的判定 isDocpathWorktree(git-dirty-guard.ts 与 changes-report.ts 各一份重复实现)未被清扫, 永远返回 false, worktree 放宽分支与 changes 的 worktree_isolation 报告静默变成死功能且无任何告警。死功能比报错更危险: 测试还在用 symlink 伪造旧契约信号喂它, 全绿掩盖失效。
触发: 修改任何共享/存储契约(symlink vs copy, tracked vs ignored, 路径布局)。期望行为: 除 R-277 的文档四层外, 额外 grep 代码中以该契约特征做判定的谓词(存在性/文件类型/路径形态检查)与用契约特征搭建 fixture 的测试; 判定逻辑应选择与契约无关的机制信号(如 linked worktree 用 .git 是文件, 而非 symlink 布局), 且全仓库仅保留一份实现。边界: 语义依赖契约的消费方(如 changes-report 的 noise 分类)不能只换判定, 需同步改写语义后再复活(见 R-289)。
### Evidence
- src/utils/git-dirty-guard.ts isLinkedGitWorktree (R-288 修复)
- src/utils/changes-report.ts:152 遗留重复实现 (R-289 待修)
- tests/dirty-worktree-guard.test.mjs 原 symlink 伪造用例已改真实 git worktree add

## pattern: state.json 变更必须经唯一持锁入口; withLock 不可重入, mutator/持锁段内禁止嵌套锁调用
- rationale: R-286: withLock 曾只覆盖 transitionWorkflow, 8 处命令层直写 writeCurrentState 构成无锁 RMW(26cd064 的 lost-update 修复只堵了正门)。收敛后写入面为 mutateCurrentState(命令层唯一入口)与 transitionWorkflow(FSM), 二者经 stateLockPath 共享同一把锁。withLock 是文件锁非可重入锁: 同一 lockPath 嵌套获取会自旋 5s 后 fail-loud 超时。
触发: 需要修改 workspace state.json, 或在 mutator/transitionWorkflow 持锁段内想调用其它状态命令。期望行为: 命令层一律 mutateCurrentState(cwd, mutator), mutator 基于入参 previous 重算增量(勿用闭包陈旧 state), 用返回值刷新局部变量; mutator 内禁止调用 transitionWorkflow 或再次 mutateCurrentState; 决策输入可在锁外计算, 但必须幂等(如 Math.max/固定值), 由锁内 previous 重算兜底。边界: engine 层(transitions/workspace 自身)在持锁段内继续用 read/write 原语; tests/lock.test.mjs 的 boundary 用例 grep 断言 src/commands|hooks 零 writeCurrentState 引用, 新旁路会直接挂测试。
### Evidence
- src/utils/workspace.ts mutateCurrentState/stateLockPath
- src/engine/transitions.ts 持锁段用原语不经 mutate
- tests/lock.test.mjs state write boundary (R-286 AC-1)

## pattern: 双副本+真源的自愈必须按「验证态四象限」裁决方向, 且与既有冲突合并机制划清边界
- rationale: R-287 实施发现: md/json sha 漂移本身无方向信息, 朴素自愈(整段重渲染或无差别吸收)在不同拓扑下分别造成内容丢失(json 没有的手写条目被渲染删除)、破坏传播(掏空视图被吸收进真源, 已确认门禁被默认值覆盖)、越权覆盖(canonical 侧独立编辑被 current 共识清除, 抢了 3-way 合并机制的活)。「已验证同步」=json 存在且与同目录 md sha 一致——json 缺失时漂移检测恒 null 属条件空洞成立, 绝不能当同步证据。
触发: 为任何「多副本+派生真源」结构设计自愈/收敛逻辑(spec/plan md-json, current-canonical 双目录, 或未来类似结构)。期望行为: (1) 方向裁决用双侧验证态四象限, 仅「基线+新编辑」(对侧已验证, 本侧未验证)可吸收, 其余象限 no-op 让位专职冲突机制; (2) 状态字段由真源 marker 强制回写, 内容字段由输入侧吸收, 整段重渲染仅用于掏空/损坏恢复且原文必须零丢失保留(附录小节); (3) 自愈只在 gate 命令(可写路径)执行, next/status 等 advisory 路径保持只读只指路; (4) fail-loud 边界(任务身份漂移/损坏 json)不得被自愈掩盖。边界: file-drift/3-way 合并拥有「双侧独立编辑」域, 自愈不得抢跑; 测试 fixture 的 helper 双目录写行为可制造与生产不同的拓扑, 断言前先确认 fixture 真实落盘态。
### Evidence
- src/utils/task-files.ts healStructuredMarkdownDrift 四象限裁决
- src/utils/structured-docs.ts enforceStructuredMarkers
- tests/check-review.test.mjs healStructuredMarkdownDrift 三用例 + 3-way 回归
