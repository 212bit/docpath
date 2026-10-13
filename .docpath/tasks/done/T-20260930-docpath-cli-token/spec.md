# T-20260930-docpath-cli-token - DocPath CLI 命令调用频次与真实 Token 消耗分析引擎

> backlog_id: R-456
> backlog_source: docpath backlog add

## 1. 背景与动机

### 背景与痛点
静态文件的协议注入比率（如 spec/plan 文件大小）无法反映实际运行开销。在真实开发中，真正产生成本的是 Agent 频繁调用 DocPath CLI（如 `docpath next`, `docpath go`, `docpath step-pass`, `docpath done`）所产生的命令行参数与命令输出返回文本（stdout/stderr）。系统需要精确统计：Agent 一共调用了多少次 DocPath 命令？调了哪些子命令？每次调用及其输出产生了多少真实 Token？

### 验收标准
- [ ] AC-1: 实现 DocPath CLI 命令调用提取器（从 Bash/run_command 中精准识别提取所有 docpath 子命令调用，统计各子命令频次与错误率）
- [ ] AC-2: 实现 DocPath 命令真实 Token 消耗归因（计算每次 docpath 命令入参与 stdout/stderr 产生的真实 Token 消耗，统计总消耗及子命令排行榜）
- [ ] AC-3: 在 `docpath monitor`（全局看板与 `--current` 实时视图）中置换并升级「⚡ DocPath 命令调用与 Token 消耗透视」面板，提供 `--agent` 与 `--json`
- [ ] AC-4: 完成单元测试覆盖并在全量门禁中通过验证

## 2. 需求清单

### 功能需求
- [ ] FR-1: DocPath CLI 命令调用频次
  - 来源 backlog: R-456
- [ ] FR-2: 真实 Token 消耗分析引擎

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- DocPath CLI 命令调用频次与真实 Token 消耗分析引擎

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

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
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: DocPath CLI 命令调用频次与真实 Token 消耗分析引擎
- 目标: DocPath CLI 命令调用频次与真实 Token 消耗分析引擎
- 背景: 来自 backlog R-456
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: DocPath CLI 命令调用频次 满足功能要求并通过测试
- [ ] AC-2: 真实 Token 消耗分析引擎 满足功能要求并通过测试
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-456 与任务 T-20260930-docpath-cli-token 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
