# T-20260609-payload-hybrid-context-index - 引入结构化 Payload 与 Hybrid Context Index

> backlog_id: R-143
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景
R-146 Fit Assessment 认为 WorkFlowX 的 Bus Payload 与 Hybrid Tree 思路值得吸收，但不应照搬外部 orchestrator、MCP 记忆图谱或多 Agent 自动编排。DocPath 的核心仍是文档状态机、CLI 路由、质量门禁和证据闭环；新增能力应作为 state/spec/plan/evidence 的结构化索引与上下文压缩层。

## 目标
先实现 DocPath 原生的结构化 Payload schema 与任务级 Hybrid Context Index，为后续 R-144 deliverables 索引、R-142 role-based context、R-145 Codex Skill 适配提供共同底座。

## 范围
- 定义轻量 Payload schema：change_summary、evaluation_result、role_report、requirement_change。
- 提供 Payload 解析与校验工具；非法 kind、缺失必填字段、非对象输入必须 fail-loud。
- 在当前任务上下文生成 Hybrid Context Index，区分 trunk（稳定目标、范围、验收、关键决策）与 leaves（执行计划、最近证据、breadcrumb、review/check 摘要）。
- `agent handoff` 可生成或引用压缩上下文索引，帮助跨会话恢复。
- `status --agent` 可输出简洁的 payload/context index 摘要或文件指针，不能显著增加噪音。
- 保持旧任务兼容：没有 payload/index 文件时，现有 status/next/agent/check/review 行为不变。

## 不包含
- 不引入 MCP 记忆图谱作为核心依赖。
- 不实现多 Agent 自动编排、worktree 并行调度或外部 orchestrator。
- 不新增独立于 `check` / `review` 的质量门禁体系。
- 不在本任务实现 R-142 的角色注册表或 R-144 的业务模板库。

## 验收
- schema 有类型定义与解析校验；非法 Payload fail-loud。
- 新增任务级 Hybrid Context Index 生成能力，输出稳定、可机器读取，并能区分 trunk/leaves。
- 至少 `agent handoff` 或等价恢复路径可引用该 index。
- `status --agent` 输出包含简洁 index 摘要或文件指针，旧任务无 index 时保持兼容。
- 测试覆盖 schema 校验、索引生成、旧任务兼容和 status 输出摘要。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 引入结构化 Payload 与 Hybrid Context Index
  - 来源 backlog: R-143

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 引入结构化 Payload 与 Hybrid Context Index

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
- 当前问题: R-142~R-145 需要专家角色、交付物、Codex Skill 等能力，但缺少统一的结构化 Payload 与任务级上下文索引底座；如果先实现角色或 Skill，产出容易停留在对话中，无法被 status/next/check/review 稳定感知。
- 目标: 先实现 DocPath 原生 Payload schema 与 Hybrid Context Index，让后续 deliverables、role-based context 和平台适配都能挂接到可验证的证据层。
- 背景: R-146 Fit Assessment 建议优先推进 R-143，且明确不照搬 WorkFlowX 的外部 orchestrator、MCP 记忆图谱或多 Agent 自动编排。
- 可选方案: A. 直接照搬 WorkFlowX Hybrid Tree/Bus Payload；B. 只做轻量 DocPath 原生 schema/index；C. 暂缓 R-143，先做角色或模板。
- 推荐方案: 采用 B。先做轻量 schema、校验、任务级 index、handoff/status 引用和旧任务兼容。
- 不做什么: 不引入 MCP 记忆图谱核心依赖；不做 worktree 并行调度；不新增平行质量门禁；不实现角色注册表或业务模板库。
- 成本: 新增 schema/index 模块、CLI 状态摘要接入、handoff 引用逻辑和测试覆盖。
- 风险: schema 过早冻结、status 输出噪音增加、index 与源文档漂移。
- 回滚方案: 保留旧任务兼容；如果 index 生成失败，status/next/agent 回退到现有 current/spec/plan/evidence 输出。
- 用户确认: 用户明确要求“先改写/推进 R-143，再 R-144，然后回到改写后的 R-142，最后处理 R-145”；R-146 文档提供决策依据。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-143 与任务 T-20260609-payload-hybrid-context-index 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
