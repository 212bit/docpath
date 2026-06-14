# T-20260614-backlog-capture-analyze-dry-run - 修复 backlog capture 无活跃任务时 analyze 建议缺少 --dry-run

> backlog_id: R-175
> implemented_with: R-174
> backlog_source: docpath backlog capture

## 1. 背景与动机

无活跃任务时，docpath backlog capture 会创建 raw backlog，并提示下一步运行 docpath analyze --mode deep --content <title>。但非 dry-run analyze 需要当前活跃任务写入 analysis/*，在 completed/idle 场景会失败。CLI 的错误提示已经要求使用 docpath analyze --dry-run，因此 capture 的下一步建议必须与 analyze 的写入边界一致。

## 2. 需求清单

### 功能需求

- [x] FR-1: backlog capture 输出下一步建议时使用 docpath analyze --dry-run --mode deep --content <title>。
- [x] FR-2: 保留通过 docpath backlog edit 回填 evidence 的流程。
- [x] FR-3: getting-started 文档说明 promote 前使用 analyze --dry-run。

### 非功能需求

- [x] NFR-1: 不改变 backlog capture 的状态写入行为。
- [x] NFR-2: 不让 dry-run 输出被当作 durable analysis evidence。
- [x] NFR-3: 增加回归测试防止 capture 再次推荐会失败的写入式 analyze。

## 3. 范围界定

### 包含

- backlog capture 输出提示修复。
- backlog-command 测试断言。
- getting-started 文档一致性说明。

### 不包含

- 不改变 analyze 写入式命令的活跃任务要求。
- 不新增自动写回 backlog evidence 的命令。
- 不删除 brainstorm/refine/analyze prompt emitter 流程。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | capture 后分析入口 | 写入式 analyze / dry-run analyze | dry-run analyze | raw backlog 尚未成为活跃任务，不能写 analysis/* |
| 2 | evidence 回填 | 自动写回 / 用户或 agent edit 回填 | edit 回填 | 保持 prompt emitter 与 artifact sink 边界 |

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
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief

- 当前问题: backlog capture 推荐的 analyze 命令与 analyze 的无活跃任务失败边界冲突。
- 目标: capture 输出可直接执行的 dry-run 分析建议，避免用户在 completed/idle 场景遇到必然失败。
- 背景: R-175 由实际 dogfood 复现产生，用户要求与 R-174 一并完成。
- 可选方案: A 保持现状；B capture 推荐 analyze --dry-run；C 让 analyze 自动写 backlog evidence；D 取消 capture 后的下一步提示。
- 推荐方案: 采用 B。最小修改，符合 prompt emitter 边界，并保留 artifact sink/edit 回填流程。
- 不做什么: 不放宽 analyze 对活跃任务的写入要求，不自动生成最终 analysis evidence。
- 成本: 低，涉及一行提示、文档和测试。
- 风险: 用户仍需手动或由 agent 通过 backlog edit 回填 evidence；但这符合现有工作流。
- 回滚方案: 恢复 capture 原提示，同时保留 analyze 的 fail-loud 错误提示。
- 用户确认: 2026-06-14 用户明确同意并要求不间断完成 R-174 和 R-175。

## 5. 验收标准

- [x] AC-1: backlog capture 输出 docpath analyze --dry-run --mode deep --content <title>。
- [x] AC-2: 测试断言输出不再包含无 dry-run 的写入式 analyze 建议。
- [x] AC-3: docs/getting-started.md 对 promote 前 dry-run 分析保持一致。
- [x] AC-4: 全量 pnpm test 已通过，DocPath check/review 通过。
