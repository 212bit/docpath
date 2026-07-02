# T-20260630-p1 - P1: 易用性优化 - 降低学习曲线和改进用户体验

> backlog_id: R-231
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

并发会话感知缺口：next/status 的 --agent 只读快照不报告其它活跃会话或状态被并发改动，Agent 据陈旧快照规划（详见 analysis/R-231-summary.md）。

## 验收

next --agent/status --agent append-only 新增 active_sessions + concurrent_session_warning 字段；agent enter 检测到并发会话时非阻塞告警；stale 会话过滤；单元测试覆盖无并发/有并发/stale 三场景 100% 通过；现有 --agent 解析器不破。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增 `listActiveSessions(cwd, { excludeSelf, selfSessionId })` 助手（src/utils/session.ts），复用 dashboard 的 readdir 模式，过滤 stale（TTL + PID 存活探测）
  - 来源 backlog: R-231
- [ ] FR-2: `next --agent` / `status --agent` YAML append-only 新增 `active_sessions`、`concurrent_session_warning`、`state_freshness` 字段；无并发时 `active_sessions: []`
  - 来源 backlog: R-231
- [ ] FR-3: `agent enter` 在登记自身后，若发现其它活跃会话，打印非阻塞 `⚠️` 告警
  - 来源 backlog: R-231

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容（`--agent` 字段 append-only，现有解析器不破）
- [ ] NFR-2: 新增行为可通过本地单元测试验证，不依赖网络或外部 LLM

## 3. 范围界定

### 包含
- `listActiveSessions` 共享助手（stale 过滤）
- `next`/`status --agent` 新增 `active_sessions` + `concurrent_session_warning` + `state_freshness`
- `agent enter` 并发会话非阻塞告警
- 无并发/有并发/stale 三场景单元测试

### 不包含
- 不改租约/锁的 fail-loud 语义；不新增阻塞式读锁
- 不做跨 worktree 会话聚合（仅当前 workspace sessions 目录范围）
- 不做自动重读/重试循环（只告警，由 Agent 决策）
- 不重构 dashboard 现有会话枚举（可后续复用本助手）

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
- 当前问题: ## 背景
- 目标: P1: 易用性优化 - 降低学习曲线和改进用户体验
- 背景: 来自 backlog R-231，Decision Brief 证据: docs/design/concurrent-session-awareness-brief.md
- 可选方案: 按 backlog 原始范围执行；或先补充分析后再执行
- 推荐方案: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-06-30 会话内确认：Accept & promote (full slice) —— active_sessions + concurrent_session_warning + state_freshness，写入 Decision Brief 后进入 spec/plan

## 5. 验收标准

- [ ] AC-1: `listActiveSessions` 助手导出，过滤 stale（超 TTL 或 PID 不存活）的会话记录
- [ ] AC-2: `next --agent` / `status --agent` 无并发时输出 `active_sessions: []`（append-only，向后兼容）
- [ ] AC-3: 存在其它活跃会话时输出非空 `active_sessions` 与 `concurrent_session_warning`，不影响现有字段解析
- [ ] AC-4: `agent enter` 检测到其它活跃会话时打印非阻塞告警
- [ ] AC-5: 单元测试覆盖无并发/有并发/stale 过滤三场景，100% 通过
- [ ] AC-6: `--agent` YAML 字段 append-only，现有 changes/check 等解析器回归不破
- [ ] AC-7: backlog 条目 R-231 与任务 T-20260630-p1 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
