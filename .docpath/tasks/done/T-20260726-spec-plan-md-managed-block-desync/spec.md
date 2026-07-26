# T-20260726-spec-plan-md-managed-block-desync - spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警

> backlog_id: R-287
> backlog_source: docpath backlog add

## 1. 背景与动机

2026-07-26 架构 review 定性：spec/plan 的 JSON+MD 双源靠 agent 自觉同步，是一系列已归档问题（write-plan 后 plan.md/plan.json 哈希反复不一致、review 检测到 spec 不同步仅提示不修复、步骤 done 后底部 checklist 未同步勾选、docs-index 陈旧告警无自愈路径）的共同根因。最典型的自伤在 check.ts:140-170：quick→standard 升级时 check 改 state.json、重生成 spec.md，然后打印「请运行 docpath write-spec 同步到 spec.json」——门禁命令自己制造双源漂移，再把弥合责任交还 agent。write-spec/write-plan/write-design/write-journal/write-analysis/write-review-skill 六个命令本质是手动同步泵。

结构化字段单真源 + MD managed block 自动重渲染：

- 约定 spec.json/plan.json 为结构化字段（FR/AC 列表、步骤状态、门禁声明、任务元数据）的唯一真源。
- spec.md/plan.md 中的结构化段落改为渲染器生成的 managed block（标记注释包围）；人类叙述段落保留人写，不参与哈希比对。
- 所有「检测到不同步」的告警路径（check/review validators）改为：调用渲染器自动重渲染 managed block，并在输出中记录已自愈——而非告警后等 agent 手修。
- write-* 命令族退化为「写 JSON + 触发渲染」的薄封装，后续可评估合并。
- 边界：本条属于数据契约/工作流行为重大变更，实施前需 brainstorm/refine + Decision Brief + 用户显式确认（CLAUDE.md 重大变更门禁）；本次仅入库排期。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-287-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
  - 来源 backlog: R-287

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 2026-07-26 架构 review 定性：spec/plan 的 JSON+MD 双源靠 agent 自觉同步，是一系列已归档问题（write-plan 后 plan.md/plan.json 哈希反复不一致、review 检测到 spec 不同步仅提示不修复、步骤 done 后底部 checklist 未同步勾选、docs-index 陈旧告警无自愈路径）的共同根因。最典型的自伤在 check.ts:140-170：quick→standard 升级时 check 改 state.json、重生成 spec.md，然后打印「请运行 docpath write-spec 同步到 spec.json」——门禁命令自己制造双源漂移，再把弥合责任交还 agent。write-spec/write-plan/write-design/write-journal/write-analysis/write-review-skill 六个命令本质是手动同步泵。
- 目标: spec/plan 结构化字段单真源: MD managed block 自动重渲染, desync 由自愈取代告警
- 背景: 来自 backlog R-287，Decision Brief 证据: 方案A(JSON 结构化真源+受管段落自愈渲染,叙述保留人写), 用户 2026-07-26 确认; 落地细化为「状态 marker 由 json 强制+内容由 md 吸收」消除整段重渲染内容丢失隐患; 备选 B(MD 真源) C(全派生) 未采纳; 不改 write-* 入口/FSM; next/status 保持只读; 回滚=heal 调用点逐点 revert; 详见 .docpath/backlog/analysis/R-287-analysis.md
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-26 用户确认方案 A（JSON 结构化真源 + managed 段落自愈渲染, 叙述保留人写）; 落地细化为 marker 强制+内容吸收见 analysis

### 已有 Decision Brief (来自 backlog evidence)

方案A(JSON 结构化真源+受管段落自愈渲染,叙述保留人写), 用户 2026-07-26 确认; 落地细化为「状态 marker 由 json 强制+内容由 md 吸收」消除整段重渲染内容丢失隐患; 备选 B(MD 真源) C(全派生) 未采纳; 不改 write-* 入口/FSM; next/status 保持只读; 回滚=heal 调用点逐点 revert; 详见 .docpath/backlog/analysis/R-287-analysis.md

## 5. 验收标准

- [ ] AC-1: 结构化字段写路径唯一（JSON）；MD 对应段落由渲染器幂等生成，重复渲染零 diff。
- [ ] AC-2: check/review 全部 desync 检测点改为自动重渲染，不再输出「请手动运行 write-* 同步」类提示。
- [ ] AC-3: 人工叙述段落在重渲染后逐字保留。
- [ ] AC-4: 崩溃/中断场景（JSON 已写、MD 未写）下，下一次任意 gate 命令自动收敛；一致性回归测试覆盖。
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-287 与任务 T-20260726-spec-plan-md-managed-block-desync 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
