# T-20260629-support-interactive-major-change-gate-co - Support Interactive Major Change Gate Confirmation in docpath check

> backlog_id: R-233
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

In docpath check command, major change confirmation gate evaluates whether there are major changes (e.g. workspace, agent behaviors) and stops if not confirmed. Currently it requires the user to edit markdown files manually to confirm, which is slow. We should support an interactive select prompt inside docpath check to let the user confirm interactively.

## 验收

When docpath check is run in TTY mode, and major change confirmation fails, it should prompt the user interactively to confirm the major change. If the user confirms, it should write back the confirmation directly to spec.md and spec.json, allowing the check to pass immediately.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Support Interactive Major Change Gate Confirmation in docpath check
  - 来源 backlog: R-233

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Support Interactive Major Change Gate Confirmation in docpath check

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
- 当前问题: 手动编辑 spec 确认重大变更太慢
- 目标: 在 docpath check 中支持交互式确认
- 背景: 来自 backlog R-233
- 可选方案: 保持原样 / 支持 CLI 交互式确认
- 推荐方案: 支持 CLI 交互式确认并自动回写 spec.md/spec.json
- 不做什么: 不涉及非 TTY/脚本化环境的强制交互确认
- 成本: 低
- 风险: CLI 提示可能被其他进程拦截
- 回滚方案: 回滚此提交
- 用户确认: Confirmed in brainstorm chat session.

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-233 与任务 T-20260629-support-interactive-major-change-gate-co 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
