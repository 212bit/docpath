# T-20260930-zcode-sqlite-token - ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量

> backlog_id: R-453
> backlog_source: docpath backlog add

## 1. 背景与动机

### 背景与痛点
ZCode 在本地维护了完整的 SQLite 数据库（`~/.zcode/cli/db/db.sqlite`），记录了每次交互真实的 `model_usage`、`turn_usage`、缓存读取 Tokens（`cache_read_input_tokens`）以及工具执行状态。此前 DocPath 仅针对 Antigravity 和文本分词估算，无法直接获取 ZCode 在多轮对话中产生的千万级真实计费 Token 和缓存命中数据。需实现原生 `ZCodeTelemetryAdapter` 直连 SQLite 数据库，实现零失真、分毫不差的会话遥测采集。

### 验收标准
- [ ] AC-1: 实现 `ZCodeTelemetryAdapter` 深度适配器，支持自动探测并直连 `~/.zcode/cli/db/db.sqlite`（解析 `model_usage` 与 `turn_usage`）及 rollout JSONL
- [ ] AC-2: 精确提取多轮累计 Token（`input_tokens`、`output_tokens`、`computed_total_tokens`、`cache_read_input_tokens` 缓存命中）与模型规格
- [ ] AC-3: 在 `docpath monitor`（全局与 `--current`）中集成 ZCode 真实度量，展现缓存命中率（Cache Hit Ratio）与多轮会话真实消耗
- [ ] AC-4: 完成单元测试覆盖并在全量门禁中通过验证

## 2. 需求清单

### 功能需求
- [ ] FR-1: ZCode 原生 SQLite 遥测直连适配器
  - 来源 backlog: R-453
- [ ] FR-2: 多轮累加 Token 真实度量

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量

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
- 当前问题: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
- 目标: ZCode 原生 SQLite 遥测直连适配器与多轮累加 Token 真实度量
- 背景: 来自 backlog R-453
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

- [ ] AC-1: ZCode 原生 SQLite 遥测直连适配器 满足功能要求并通过测试
- [ ] AC-2: 多轮累加 Token 真实度量 满足功能要求并通过测试
- [ ] AC-3: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-4: backlog 条目 R-453 与任务 T-20260930-zcode-sqlite-token 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
