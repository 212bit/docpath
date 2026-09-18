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

## pattern: 判定与执行分离的操作必须在执行点复核判定依据(write-before-validate/TOCTOU 家族)
- rationale: 同日两例同族缺陷: R-291 plan 先写盘后校验 FSM(completed 任务证据被污染 3 次); R-296 锁 stale 夺锁基于陈旧判定 rename 误夺新获取的活锁(全量套件实测 4/5 丢更新, 隔离测试 18/18 全绿掩盖——竞态类缺陷必须满载/压力验证)。共同模式: 判定(合法性/staleness)与执行(写盘/rename)之间状态可变, 判定结果不复核即执行。
触发: 实现任何「先判定后执行」的状态操作(门禁校验+写盘, staleness+回收, 存在性+创建)。期望行为: (1) 执行点用判定时捕获的原始内容/版本做紧邻复核, 不匹配即放弃; (2) 破坏性执行(rename/unlink/覆写)后核对实际作用对象, 误伤按原文恢复; (3) 无法完全闭合的残余窗口显式注释定性并用兜底机制(tenure 复核/持锁最终校验)收敛; (4) 竞态修复的测试必须含并发压力用例且经全量套件满载验证, 隔离绿不作数。边界: 完全闭合需 OS 级 flock/心跳续租, 引入前以上工程手段为上限。
### Evidence
- src/commands/plan.ts R-291 前置校验
- src/utils/lock.ts takeoverStaleLock/tenure 复核 (R-296)
- tests/lock.test.mjs 并发 stale 夺锁压力用例

## pattern: 协议契约手写层已收敛为 templates/protocols/ 唯一 canonical, 全链清扫面随之缩减
- rationale: R-297 落地: templates 根层 4 份 flavor 副本删除(曾是 R-273/R-277/R-290 修一层漏一层的事故层, 且实锤 3 处漂移: protocols/OPENCODE 缺 71 行 worktree 章节/templates/AGENTS 写死项目名会泄漏进其它项目/CODEX 无 canonical), install/init 全部改读 protocols 参数化源, 防复辟断言在 build-scripts 测试固化。
触发: 修正协议/契约文档(CLAUDE/AGENTS/CODEX/OPENCODE 语义)。期望行为: 只改 templates/protocols/<flavor>.md 一处; 本仓库 root 副本经 install 渲染刷新(manifest drift 治理), .docpath/protocols 经 install protocols group 分发; flavor 间为措辞重写关系, 语义变更仍需人工核对 4 份 flavor 的对应段落(共享段注入见后续方案 B 条目)。边界: R-277 规则的清扫面从「根副本+docs+templates+protocols」缩减为「protocols canonical + flavor 间语义对齐」; templates 根层出现 flavor 协议文件即为复辟, 测试会拦。
### Evidence
- templates/protocols/ 4 flavor canonical
- src/utils/install-core.ts:211 / install.ts:609 / init.ts:384 读点
- tests/build-scripts.test.mjs R-297 防复辟断言

## rule: gate 写边界双教义——运行时/派生工件可自愈写, 手写源绝不写
- rationale: R-287 与 R-300 分别确立了 gate 的两种漂移处理姿态, 边界以「工件是否手写源」划分: spec/plan 的 md/json、docs-index、state 升级属运行时/派生工件, gate(check/review)可自愈写并 loud 输出(🩹); templates/protocols(含 blocks)属手写源, gate 只 fail-loud 指向修复命令(render), 绝不代写。乱站边的后果: 自愈手写源=静默改作者文本(不可接受), 只告警运行时工件=退回 R-287 前的"检测即甩锅 agent"。
触发: 为任何 gate/命令新增漂移检测或修复路径。期望行为: 先判定工件类别——派生/运行时(由命令生成、可从真源重建)→ 自愈写+loud; 手写源(人类编辑的模板/规则/协议块)→ fail-loud+指路。边界: advisory 只读路径(next/status)两类都不写, 只指路; 自愈必须零内容丢失(R-287 四象限先例)。
### Evidence
- src/commands/check.ts 入口: heal(运行时自愈) 与 protocol blocks 校验(手写源 fail-loud) 并存
- src/commands/render.ts --view protocols 为手写源的显式修复命令
- rules 本条来源: 2026-07-27 二次架构 review P2-c

## gotcha: 被门禁拦截禁止盲试错——先读门禁实现源码, 试错上限三次
- rationale: R-329 实施期 go dirty-guard 拦截后连续 5 轮插桩试错(约 1M token), 最终发现语义在 src/utils/git-dirty-guard.ts 80 行内写得明明白白(untracked 新文件需 git add 认领归属, 已跟踪修改放行); 每轮试错的脚本+输出都会进入会话上下文并被后续所有调用重放, 试错是最贵的调试方式。
触发: 任何 docpath 门禁报错拒绝(quick 溢出/dirty guard/R-305 分类法/major-change/状态机前置)。
期望行为: 第一次被拦即读该门禁的 src 实现(commands/ 对应命令文件与 utils/ 守卫), 按实现语义走合法通道——预存改动用 `docpath run start --step <id> --note` 恢复入口; untracked 归属用 git add 认领; quick 溢出按提示升级标准生命周期。同一调试问题 3 次工具调用未解决 → 强制转读源码; 需运行时验证多个条件时, 单脚本一次打全所有条件与 filter 内部, 禁止增量试探。
边界: 读源码仍无法定位时才用 DOCPATH_DEBUG=1 运行时诊断; 门禁实现确实有 bug 时走 task 流程修复而非绕过。
### Evidence
- 本仓库会话 2026-09-11: go guard 5 轮插桩记录(R-329 任务 T-20260911-trace-status)
- src/utils/git-dirty-guard.ts assertNoNonDocPathChangesForExecutionStart
- AGENTS.md Command Boundaries: CLI owns mechanical consistency checks

## rule: agent 上下文预算纪律——早轮内容按剩余调用次数重放计费
- rationale: 会话 token 的主体是历史重放而非新增内容(实测会话 8M 中新增内容 <5%); 早轮进入上下文的每 KB 会被后续所有模型调用重放, 第 3 轮塞入的 4K 文件 ≈ 4K × 30 次重放 = 120K 实际消耗, 感觉轻松的讨论前期是每 KB 最贵的阶段。
触发: agent 在会话前期(前 10 轮)读取文件/执行命令/写代码。
期望行为: read 默认定向(grep 定位 + offset/limit 切片), 不整读大文件; 大输出命令加 head/tail 限制; 跨会话交接用 backlog capture/key 记忆(500 token)替代会话史重放(200K); 独立批调用并行发起, 减少模型调用轮次。
边界: 必要的全量理解(如首次读核心模块)不适用此条; 正确性优先于省 token, 不为省 token 跳过验收。
### Evidence
- 会话 token 尸检 2026-09-11: 8M 中固定重放税 ~40% / 调试螺旋 ~30% / 大文件进出 ~20%
- R-329 backlog capture 实证: 讨论结论压缩为 500 token 自包含条目, 实现会话零讨论史依赖
- .docpath/workspace/breadcrumb.jsonl: 弹回恢复循环是成本大头(与 120 份归档任务统计一致)

## gotcha: check_fail 是既有事实：--skip-check 只记审计不改 gate；收口命令写 review 类事件前必须 FSM 预检
- rationale: R-349 初版把崩溃归因为「--skip-check 把 gate 置为 check_fail」——事实错误：recordSkipReason 只 appendDecision('policy.skip')，历史各版本与当前代码都不改 gate。真实触发条件是 done 时 gate 仍不是 check_pass（none/check_fail），review 类事件的 requiredGate 不满足。这类归因错误会直接推导出错误修复方案（给失败态开 skip 口子）。
触发：任务处于 gate=none/check_fail 时执行 agent done（含 --skip-check）、或 quick/instant profile 自动跳 review。期望行为：命令层先调 assertWorkflowEventLegal(cwd, event) / workflowEventBlockReason({phase,gate}, event) 判定，非法则输出 WORKFLOW_EVENT_BLOCKED 结构化诊断（含 gate/phase、允许集合、恢复命令 docpath check）并 exit≠0；blocked closeout 走 agent.blocked 而非 review.failed。边界：FSM 预检只负责「别抛裸异常、讲清原因」，不得放宽 requiredGate 或用 --skip-* 越过已失败的检查结论；需要「环境性 check 无法运行」的出口时另开契约级需求裁定。
### Evidence
- src/engine/policy.ts recordSkipReason（仅 appendDecision，无 transition）
- src/engine/transitions.ts:88-93 requiredGate 表 + :279-286 门禁前置执行
- 本机复现：gate=check_fail + agent done --skip-check → 修复前 Illegal workflow transition，修复后可操作诊断

## gotcha: errorOutput 在 `cmd 2>&1` 形态下丢真实输出：stderr 为空时返回通用文案，环境类失败识别全链路失效
- rationale: runCheck 统一用 `${cmd} 2>&1` 执行，子进程把 stderr 折进 stdout，err.stderr 为空字符串。旧 errorOutput 先判 'stderr' in err 即 return（空串回落 err.message），于是每条失败都退化成 'Command failed: <cmd>'——looksLikeEnvironmentFailure 永远匹配不到，环境诊断与（新增的）豁免判定都成了死代码。这解释了为何 R-023 的 docker 缺失从未被识别为环境问题。
触发：check 的 runner 失败且命令带 2>&1（runCheck 的全部路径）。期望行为：按「哪个流有内容用哪个」取失败输出（stderr 非空优先，否则 stdout，两者皆空才回退 err.message）。边界：不要改成拼接两个流——检查项 output 会写入 last-check 证据与报告，重复文本会让 evidence 膨胀；也不要只取 stdout（无重定向的调用方 stderr 才是有效内容）。验证：用 dp-missing-<tool> 这类不存在的命令即可复现（修复前 output='Command failed: ...'，修复后 output='sh: 1: ...: command not found'）。
### Evidence
- src/commands/check/formatters.ts errorOutput（R-350 修复）
- src/commands/check/runners.ts runCheck 的 `${cmd} 2>&1` 拼接
- tests/check-env-exempt.test.mjs（AC-1/AC-3 依赖该输出被正确捕获）
