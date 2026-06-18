# T-20260609-role-profile-role-based-context - 引入 Role Profile 与 role-based context

> backlog_id: R-142
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景
对比 ReJeCtAll/ExpertTeam-Codex 后发现，DocPath 有强状态机与质量门禁，但缺少可复用的角色化上下文层。R-146 Fit Assessment 明确建议 R-142 不实现自动专家团编排，而是在 R-143 Payload/Hybrid Context Index 与 R-144 deliverables 索引之上，实现轻量 role profile，让不同 Agent 看到更专业、但仍受状态机约束的任务视图。

## 目标
在 DocPath 中引入第一版 Role Profile 与 role-based context，作为状态机之上的可选上下文裁剪层，而不是替代现有 spec→plan→go→check→review→journal 流程。

## 范围
- 内置 team：product、design、software、qa。
- 内置 role：product-director、requirement-analyst、user-researcher、competitive-analyst、design-lead、prototype-builder、software-architect、software-engineer、qa-engineer。
- 支持从当前任务 state/spec/plan、R-143 Hybrid Context Index、R-144 deliverables index 生成 role-based context。
- role context 必须明确：职责、应读文件、应产出 deliverable/payload、不可绕过的 DocPath 门禁。
- 未知 role/team 必须 fail-loud。

## 不包含
- 不做自动专家团调度。
- 不做 Lead 自动分配、并行执行或工作树隔离。
- 不新增独立于 check/review 的角色质量门禁。
- 不绑定 Codex Skill；R-145 后续只做平台适配。

## 验收
- 新增命令或等价入口可列出 teams/roles，并输出某 role 的 agent context。
- role context 能引用当前任务、Hybrid Context Index 和 deliverables index，并明确产物落盘要求。
- 不破坏现有 docpath status/next/agent/check 行为。
- 有单元测试覆盖 role 解析、context 渲染和未知角色 fail-loud。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 引入 Role Profile 与 role-based context
  - 来源 backlog: R-142

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 引入 Role Profile 与 role-based context

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
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: DocPath 有通用 agent context，但缺少按产品、设计、工程、QA 角色裁剪的任务视图；如果直接照搬专家团编排，会产生状态机外的隐式流程。
- 目标: 提供轻量 Role Profile 与 role-based context，让角色只影响上下文视角和产物建议，不改变 spec->plan->go->check->review->journal 主流程。
- 背景: R-146 建议改写 R-142；R-143 已提供 Hybrid Context Index；R-144 已提供 deliverables 模板与索引。
- 可选方案: A. 自动专家团/Lead 编排；B. 轻量 role profile/context；C. 不做角色层。
- 推荐方案: 采用 B。新增 `docpath roles list|context`，内置少量角色，输出职责、必读文件、建议产物和不可绕过门禁。
- 不做什么: 不做自动调度；不做并行执行；不新增质量门禁；不绑定 Codex Skill。
- 成本: 新增 role registry/context 渲染模块、CLI 注册和测试。
- 风险: 角色模板过多导致维护成本上升；上下文输出过长影响 agent 注意力。
- 回滚方案: 角色命令是可选入口，不影响 status/next/agent/check；未知角色 fail-loud。
- 用户确认: 用户明确要求在 R-143/R-144 后推进改写后的 R-142；R-146 文档提供决策依据。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-142 与任务 T-20260609-role-profile-role-based-context 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
