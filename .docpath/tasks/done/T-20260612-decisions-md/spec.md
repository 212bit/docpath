# T-20260612-decisions-md - decisions.md 老化策略避免无限增长

> backlog_id: R-158
> backlog_source: docpath backlog add

## 1. 背景与动机

`.docpath/workspace/decisions.md` 会在 journal、review、check 等流程中持续追加 ADR 记录。当前文件已经增长到十几万行级别，虽然常规 `status/next/go` 不会默认加载完整 decisions，但分析、查询、reveal 或人工检索历史决策时仍可能一次性读入过大的 Markdown，造成上下文预算和编辑体验压力。

根因是 `appendDecision` 只有追加能力，没有配套老化策略。R-158 需要让当前主 decisions 文件保留近期决策，把超过保留窗口的历史条目按月归档为 `decisions-YYYY-MM.md`，同时保留明确的手动触发入口和 journal 自动触发入口。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增 decisions 老化逻辑，按 `created_at` 判断超过 30 天的 ADR 条目，并按月归档到 `.docpath/workspace/decisions-YYYY-MM.md`。
- [ ] FR-2: `.docpath/workspace/decisions.md` 保留 header 与最近 30 天内的 ADR 条目。
- [ ] FR-3: 归档文件按月合并，重复执行不得重复写入同一 ADR。
- [ ] FR-4: journal 完成归档后自动触发 decisions 老化；同时提供显式 `docpath gc-decisions` 命令供手动触发。
- [ ] FR-5: 支持测试/调试场景跳过 journal 自动老化，避免影响特定 fixture。
- [ ] FR-6: 文档说明 decisions 会自动老化，历史查询需读取 `decisions-YYYY-MM.md`。

### 非功能需求
- [ ] NFR-1: 保持现有 `appendDecision`、`getRecentDecisions`、journal、review、check 流程兼容。
- [ ] NFR-2: 不引入外部依赖，不改变 ADR 条目结构。
- [ ] NFR-3: 老化逻辑必须幂等、可测试，并能在 decisions 文件不存在或仅有 header 时安全返回。

## 3. 范围界定

### 包含
- 在决策日志治理模块中实现按月轮转与去重写入。
- 新增 `docpath gc-decisions` CLI 命令。
- journal 成功写入决策日志后自动触发老化，并提供跳过参数。
- 增加覆盖 60 天跨度、幂等、空文件/无 decisions 文件的测试。
- 更新 Agent 协议/文档说明历史决策读取方式。

### 不包含
- 不修改 `decisions.md` 的 ADR 正文结构。
- 不实现按条数 cap 或按任务目录拆分决策。
- 不默认把归档 decisions 文件加入常规 `status/next/go` 上下文。
- 不做迁移式压缩或删除历史决策。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 老化策略 | 按月轮转 / 按条数 cap / 按任务归档 | 按月轮转 | 时间边界清晰，便于历史查询，也不会破坏跨任务决策追溯 |
| 2 | 触发方式 | 仅手动命令 / 仅 journal 自动 / 手动命令 + journal 自动 | 手动命令 + journal 自动 | 自动控制增长，同时保留运维式显式入口 |
| 3 | 幂等策略 | 追加即归档 / 归档前按 ADR id 去重 | 按 ADR id 去重 | 重复执行 `gc-decisions` 不应重复历史条目 |
| 4 | 保留窗口 | 30 天固定 / 可配置 | 先固定 30 天 | 满足 R-158 当前目标，避免引入配置复杂度 |

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
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: decisions.md 只有追加没有老化，长期增长会增加上下文和编辑负担。
- 目标: 保留近期决策在主文件，按月归档历史决策，并让 journal 自动控制增长。
- 背景: R-158 已记录当前 decisions 文件增长风险，推荐方案为按月轮转。
- 可选方案: 按月轮转；按条目数 cap；按任务目录拆分。
- 推荐方案: 固定 30 天保留窗口，超过窗口的 ADR 按 created_at 归档到 `decisions-YYYY-MM.md`；新增 `gc-decisions` 命令并在 journal 成功归档后自动触发。
- 不做什么: 不压缩、不删除历史决策；不改变 ADR 条目结构；不把历史归档纳入默认上下文。
- 成本: 新增治理逻辑、CLI 注册、测试和文档维护。
- 风险: 日期解析错误可能移动错误条目；通过按 ADR id 去重、保留 header、测试 60 天跨度和幂等执行降低风险。
- 回滚方案: 回退 decisions 老化实现和 CLI 注册；已生成的 `decisions-YYYY-MM.md` 可按 ADR id 合并回 `decisions.md`。
- 用户确认: 2026-06-13 用户明确要求“执行 R-158”。

## 5. 验收标准

- [ ] AC-1: `docpath gc-decisions` 可手动触发 decisions 老化。
- [ ] AC-2: 模拟 60 天跨度的 ADR 后，超过 30 天的条目进入 `decisions-YYYY-MM.md`，近期条目留在 `decisions.md`。
- [ ] AC-3: 重复执行 `gc-decisions` 不重复归档同一 ADR。
- [ ] AC-4: journal 成功归档后会触发 decisions 老化；测试/调试可通过参数跳过。
- [ ] AC-5: 文档说明 decisions.md 自动老化与历史查询路径。
- [ ] AC-6: `pnpm test`、`docpath check`、`docpath review` 通过。

## 6. 风险与依赖

- 依赖 ADR 条目内 `created_at` 字段；缺失或无法解析的条目应保留在主文件，避免误归档。
- 当前 `.docpath` 多数运行态文件被 gitignore，测试需使用临时 workspace 覆盖真实文件行为。
- journal 自动触发老化后，历史查询方需要明确读取归档文件。
