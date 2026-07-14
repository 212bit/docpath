# T-20260712-refactor-long-commands-and-tighten-state - Refactor long commands and tighten state compatibility

> backlog_id: R-260

**任务 ID**: T-20260712-refactor-long-commands-and-tighten-state
**状态**: 已确认

## 1. 背景与动机

上一轮可靠性优化补强了状态契约测试、Agent 输出契约测试，并修复了 `write-spec` 在无 `task_id` 状态下无法绑定任务的问题。Review 同时暴露两个长函数警告：`traceCommand` 和 `writeSpecCommand`。本任务继续做小步高价值优化：拆分长函数降低维护风险，同时进一步收紧状态兼容层，减少 `current.md` 作为默认决策来源的残留耦合。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 拆分 `src/commands/trace.ts` 中 `traceCommand` 的 matrix 分支和普通 trace 分支，使主函数只负责高层路由。
- [ ] FR-2: 拆分 `src/commands/write-spec.ts` 中 `writeSpecCommand` 的输入读取、任务身份解析、写入目标解析和 post-write payload 构造。
- [ ] FR-3: 收紧状态兼容层：命令绑定任务身份时优先使用 `state.json` 和 spec H1，避免把 `current.md` 作为默认决策路径；保留 legacy migration fallback。
- [ ] FR-4: 增加或调整测试覆盖拆分后的行为，尤其是无 `task_id` 写 spec 绑定任务、legacy current.md 迁移、trace matrix 分支输出。

### 非功能需求
- [ ] NFR-1: 不改变 CLI 命令参数、输出语义、状态迁移语义或 Dashboard 行为。
- [ ] NFR-2: 不删除 current.md legacy 迁移能力，只降低默认使用频率和误导性命名。
- [ ] NFR-3: 不引入新依赖。

## 3. 范围界定

### 包含
- `traceCommand` 内部结构拆分。
- `writeSpecCommand` 内部结构拆分。
- `workspace`/任务身份解析相关命名或 helper 收敛。
- 与上述行为直接相关的测试补强。

### 不包含
- 不重构完整状态机。
- 不删除 current.md 渲染、同步或 legacy migration。
- 不调整 `next/status/check/review/changes` 的 YAML 字段契约。
- 不做 Dashboard 或 UI 改动。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 长函数处理方式 | A: 大规模模块重写；B: 提取局部 helper | B | 降低风险，保持外部行为稳定。 |
| 2 | current.md 兼容层处理 | A: 删除 fallback；B: 保留 migration，收紧默认决策路径 | B | 兼容旧工作区，同时减少新路径对渲染视图的依赖。 |

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
- 当前问题: `traceCommand` 和 `writeSpecCommand` 过长，状态兼容层仍有 `current.md` 命名和默认读取路径带来的认知噪声。
- 目标: 用小步重构降低维护复杂度，进一步明确 state.json/spec H1 是任务身份决策来源，current.md 只作渲染视图和 legacy migration fallback。
- 背景: 用户在上一轮优化后明确选择“拆长函数 + 再收紧状态兼容层”。
- 可选方案:
  - 方案 A: 大规模重构命令和状态模型。
  - 方案 B: 提取局部 helper，保留兼容 fallback。
  - 方案 C: 只修 review 警告，不动兼容层。
- 推荐方案: B。
- 决策理由: 直接降低当前维护风险，且不会破坏旧工作区迁移。
- 不做什么: 不删除 current.md，不改 CLI 外部契约，不重写状态机。
- 成本: 小范围重构和测试补强。
- 风险: helper 提取可能改变错误路径或输出顺序；通过现有全量测试和目标测试控制风险。
- 回滚方案: 回退本任务修改，恢复原命令函数结构。
- 用户确认: 用户已回复“拆长函数 + 再收紧状态兼容层”。

## 4.2 UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

## 5. 验收标准

- [ ] AC-1: `traceCommand` 主体明显缩短，matrix 处理逻辑由独立 helper 承担，trace 行为测试保持通过。
- [ ] AC-2: `writeSpecCommand` 主体明显缩短，输入读取、任务身份解析、写入目标解析和 post-write payload 由 helper 承担。
- [ ] AC-3: 状态兼容层保留 legacy current.md 迁移，但新任务身份解析测试证明无 `task_id` 时从 spec H1 绑定，且 state 优先路径不依赖 current.md。
- [ ] AC-4: `pnpm run typecheck`、目标测试、`pnpm test`、`docpath check` 和 `docpath review` 通过。
