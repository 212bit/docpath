# T-20260715-promote-write-spec-fr-checklist-spec-jso - promote/write-spec 真源同步语义前置化

> backlog_id: R-263
> backlog_source: docpath brainstorm (2026-07-14 R-260 立项实操)

## 1. 背景与动机

`backlog promote` 当前从 backlog 生成 task spec 时，会把 `item.title` 写成唯一的 `FR-1`。如果 backlog body 已经包含真实的 `- [ ] FR-N: ...` checklist，或经过 brainstorm/立项沉淀出的 FR 条目，这些条目只留在背景段，不会进入 `spec.json.functional_requirements` 真源。

DocPath 的结构化任务真源是 `spec.json`；`spec.md` 是可读视图。`write-spec --stdin` / `write-spec --content` 会触发 `spec.md -> spec.json` 解析同步，直接手改 `spec.md` 不会更新真源。这个语义需要在 promote 输出和 agent next hint 中前置提醒，避免 agent 直接 plan 时拿到笼统 FR，或误以为手改 markdown 已同步 truth source。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。
- [ ] FR-2: backlog body 不存在可解析 FR checklist 时，保持现有回退行为：生成单条 `FR-1`，内容为 backlog title，并保留 backlog 来源说明。
- [ ] FR-3: `docpath backlog promote` 输出必须显式提示 spec truth sync 语义：如果需要细化 FR/AC，应使用 `docpath write-spec --stdin`；直接手改 `spec.md` 不更新 `spec.json` 真源。
- [ ] FR-4: `docpath next --agent` 在 promote 后的 drafting 阶段也应暴露同等 truth sync hint，帮助后续 agent 在 plan 前使用正确入口修订 spec。
- [ ] FR-5: DocPath 使用文档补充 spec truth sync 说明，明确 `spec.json` 是结构化真源，`write-spec` 是同步入口，直接编辑 `spec.md` 不会更新真源。

### 非功能需求
- [ ] NFR-1: 变更保持向后兼容，不改变 `spec.json` 作为机器真源的地位。
- [ ] NFR-2: FR checklist 解析应保守，只解析 markdown checklist 行中的 `FR-N:`，不把 YAML 代码块或普通背景文本误提升为需求。
- [ ] NFR-3: 新增提示应为附加信息，不破坏现有 CLI 输出和 agent YAML 消费者的字段兼容性。

## 3. 范围界定

### 包含
- `backlog promote` 生成 spec 时解析 backlog body 中的 FR checklist。
- promote 输出与 promote 后 `next --agent` hint 的 truth sync 提醒。
- 面向 agent/使用者的文档说明。
- 针对 R-260/R-262 类似 checklist backlog 的回归测试。

### 不包含
- 改变 `spec.json` 作为真源的定位。
- 解析 YAML 代码块里的 FR。
- 实现 direct-edit divergence 的 check/doctor 告警；该项作为后续可选工作保留。
- `changes --agent` 归组或 journal dry-run 等其他 backlog。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | FR 来源 | 解析 checklist / 解析 YAML / 保持 title fallback | 优先解析 checklist，缺失时 fallback title | checklist 与现有 `parseSpecMarkdownDocument` 语义一致，风险最低 |
| 2 | truth sync 提示 | 只在文档 / promote 输出 / next hint | promote 输出和 next hint 都提示，文档固化 | 让当前 agent 和接手 agent 都能在 plan 前看到正确入口 |
| 3 | FR-3 防误改告警 | 本任务实现 / 后续 backlog | 后续 backlog | content hash 分叉检测涉及 check/doctor 边界，超出当前 P3 小范围修复 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: backlog promote 未将已有 FR checklist 提升到 `spec.json` 真源，且 CLI 未前置说明 `write-spec` 才会同步 truth source。
- 目标: 让 checklist FR 在 promote 阶段进入结构化真源，并在 CLI/文档中降低误改 spec 的风险。
- 背景: R-260/R-262 立项实操中观察到 promote 后 spec.json 只有笼统标题 FR，后续必须通过 `write-spec --stdin` 才能恢复结构化需求。
- 可选方案: A. checklist-only 小修；B. 同时解析 YAML；C. 增加 full divergence checker。
- 推荐方案: A，附带 CLI/文档提示。
- 决策理由: A 与现有 spec parser 格式一致，能覆盖已知问题，同时避免把背景/YAML 推断为机器真源。
- 不做什么: 不解析 YAML，不改变真源模型，不在本任务实现 direct-edit divergence gate。
- 成本: 小到中等，涉及 backlog promote、next hint、文档和测试。
- 风险: next hint 文案字段需要保持兼容；通过追加式提示和回归测试控制。
- 回滚方案: 回滚本任务提交即可恢复旧 promote 行为。
- 用户确认: 已确认。

## 5. 验收标准

- [ ] AC-1: backlog body 含 `- [ ] FR-N: ...` checklist 时，promote 后的 `spec.json.functional_requirements` 包含全部 checklist FR，而不是单条 title FR。
- [ ] AC-2: backlog body 不含 FR checklist 时，promote 行为保持兼容，仍生成 title fallback FR。
- [ ] AC-3: `docpath backlog promote` 输出包含 truth sync hint，并指向 `docpath write-spec --stdin`。
- [ ] AC-4: promote 后 `docpath next --agent` drafting hint 包含 truth sync 语义或等价上下文。
- [ ] AC-5: 文档补充 spec truth sync 语义：`write-spec` 同步 `spec.json`，直接手改 `spec.md` 不更新真源。
- [ ] AC-6: 新增/更新回归测试覆盖 R-260/R-262 类似 checklist backlog 场景。
- [ ] AC-7: `docpath check`、`docpath review`、`docpath journal` 通过后，变更可提交。
