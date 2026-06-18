# T-20260615-fix-cli-command-contract-validation - Fix CLI command contract validation

> backlog_id: R-185
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

Review found CLI command-contract drift: invalid review/diff scopes silently fall back, several numeric options accept NaN or partial values, review --no-ai is advertised without behavior, and write-spec exposes an ignored --section flag.

## 验收

Invalid enum and numeric CLI inputs fail loudly with clear messages; stale no-op options are removed or made honest; regression tests cover the reviewed command-surface failures.

## 2. 需求清单

### 功能需求
- [ ] FR-1: Fix CLI command contract validation
  - 来源 backlog: R-185

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 严格校验 `review --scope`、`diff --scope`、`diff --step`。
- 严格校验数值型 CLI 参数：`context --max-tokens`、`reveal --level`、`compact --max-entries`、`agent handoff --max-entries`、`dashboard --port`。
- 移除或修正已注册但无实际行为的 CLI 选项：`review --no-ai`、`write-spec --section`。
- 增加回归测试覆盖上述命令契约。

### 不包含
- 不引入 LLM review 实现。
- 不改变 DocPath 状态机语义或现有成功路径。
- 不重构 CLI 注册架构。

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

### Decision Brief
- 当前问题: 部分 CLI 命令契约与实际行为漂移，导致无效参数静默回退或无效选项被接受。
- 目标: 让 CLI 对无效 enum/number 参数 fail-loud，并移除无实际行为的公开选项。
- 背景: 用户要求 review existing cli commands 后确认 “fix it”。
- 可选方案: 保留兼容的静默回退 / 增加警告 / 改为严格报错。
- 推荐方案: 对明确文档化的 enum/number 输入采用严格报错；删除未实现的公开选项。
- 不做什么: 不实现 AI review；不扩大为 CLI 框架重构；不改变正常合法命令路径。
- 成本: 依赖无效参数静默回退的调用方需要修正参数。
- 风险: 少数脚本如果传入拼写错误但依赖旧回退行为，会从隐式成功变为失败。
- 回滚方案: 恢复对应注册层和命令层校验变更，保留测试更新作为行为说明。
- 用户确认: 用户在 review 结果后明确要求 “fix it”。

## 5. 验收标准

- [ ] AC-1: 无效 `review --scope` / `diff --scope` / `diff --step` 会清晰失败。
- [ ] AC-2: 无效数值参数会清晰失败，不会把 `NaN` 传入命令实现。
- [ ] AC-3: `review --no-ai` 和 `write-spec --section` 不再作为无效公开契约出现。
- [ ] AC-4: 回归测试覆盖上述命令契约并通过。

---

*此文件由 `docpath backlog promote` 生成。*
