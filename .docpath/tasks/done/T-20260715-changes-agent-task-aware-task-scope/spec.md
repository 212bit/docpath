# T-20260715-changes-agent-task-aware-task-scope - changes --agent task-aware grouping and explicit scope

> backlog_id: R-262
> backlog_source: docpath brainstorm (R-266 收尾复盘)

## 1. 背景与动机

R-266 收尾复盘发现，一个工作树可能同时包含当前 task 证据、其他 task 的漂泊实现、backlog 落库或共享文件。当前 `docpath changes --agent` 主要按粗文件类别和当前 active task 标题生成 closeout 建议，缺少 task-aware 归组能力，导致 agent 需要人工拆分提交范围和 commit message。

R-262 从 R-260 中切分出来，专注 changes 命令行为：`changes --agent` 保持只读报告，不执行 stage/commit，但要让 agent 看清哪些文件属于选定 task，哪些文件可能不属于当前 task，并支持显式 `--task` / `--scope` 选择。

补充 analysis evidence: `.docpath/backlog/analysis/R-262-analysis.md`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath changes --agent` 在默认 current-task closeout 中输出 task-aware 归组，把 `.docpath/tasks/<current_task_id>/...` canonical evidence 识别为当前 task 文件。
- [ ] FR-2: `docpath changes --agent` 应把其他 task canonical evidence、backlog 落库、共享文件、普通 source/test/doc 改动列为 outside-selected-task 或等价字段，并明确标注这些文件可能不属于当前 task。
- [ ] FR-3: `docpath changes --agent --task <task_id>` 支持为非当前 task 生成 closeout 视图和 commit 建议；能从 canonical task spec/json 中解析 task title 时使用真实标题，解析不到时回退 task id。
- [ ] FR-4: `docpath changes --agent --scope <file-list>` 支持基于显式文件集生成 closeout 视图和 commit 建议，避免把未选中文件混入 staged/recommended guidance。
- [ ] FR-5: 新增输出必须保持 append-only 兼容：现有 `ready_to_commit`、`groups`、`blocking_reasons`、`recommended_stage_command`、`suggested_commit_message` 语义不破坏。
- [ ] FR-6: `changes` 人类输出和 agent YAML 输出都应暴露选定范围/归组摘要；JSON 输出应包含同等结构化字段。

### 非功能需求
- [ ] NFR-1: `changes` 仍为 read-only，不 stage、不 commit、不修改 workflow state。
- [ ] NFR-2: 不对普通 source/test/doc 文件做强 task ownership 推断；除非通过 `--scope` 显式选择，否则只标注为可能不属于选定 task。
- [ ] NFR-3: 与现有 worktree isolation、ignored evidence、untracked evidence closeout 逻辑兼容。
- [ ] NFR-4: CLI 参数解析需 fail loud：未知 task、空 scope、scope 路径未出现在当前 diff 中时给出可操作提示或明确 empty selection。

## 3. 范围界定

### 包含
- `src/commands/changes.ts` CLI 参数与 human/agent rendering 更新。
- `src/utils/changes-report.ts` report options、task metadata lookup、scope filtering、task-aware grouping。
- 覆盖默认 current task、`--task`、`--scope`、兼容现有单 task closeout 的回归测试。

### 不包含
- 自动 stage/commit。
- 修改 `docpath review` 的 scope 推导；R-262 只提供 changes 上游选择能力。
- 把普通 source/test/doc 文件自动绑定到某个 task。
- 改变 dirty worktree guard 的拒绝策略。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | task ownership | 自动推断所有文件 / 只识别 canonical evidence + 显式 scope | 只识别 canonical evidence + 显式 scope | source/test 文件不携带可靠 task 身份，避免误导 agent |
| 2 | output compatibility | 重写 groups / append-only 新字段 | append-only 新字段 | 降低对现有 agent/YAML consumer 的破坏风险 |
| 3 | command side effect | changes 执行 stage / changes 只报告 | 只报告 | 保持 command boundary，commit 权仍归 agent/user |

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
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: `changes --agent` 在混合工作树中缺少 task-aware 归组，commit 建议容易误用当前 task 标题。
- 目标: 通过追加式 report 字段和显式 `--task` / `--scope`，让 agent 能按正确任务拆分 closeout。
- 背景: R-266/R-260 收尾复盘发现多个 backlog/task 改动混在同一工作树时必须人工拆分。
- 可选方案: A. 只改提示文案；B. 增加 task-aware report 和显式选择；C. 让 changes 自动 stage/commit。
- 推荐方案: B。
- 决策理由: B 提供机器可读归组能力，同时保持 changes read-only 边界。
- 不做什么: 不自动归属 source/test 文件，不改 review scope，不执行 stage/commit。
- 成本: 中等，涉及 report schema、CLI options 和 closeout tests。
- 风险: YAML consumer 兼容性；通过 append-only 字段和回归测试控制。
- 回滚方案: 回滚本任务提交即可恢复旧 changes 输出。
- 用户确认: 用户已要求继续推进其他 backlog，按 R-262 scope 执行。

## 5. 验收标准

- [ ] AC-1: 多需求混合工作树时，`changes --agent` 输出当前 task canonical evidence 与 outside-selected-task 文件分组，并提示 outside 文件可能不属于当前 task。
- [ ] AC-2: `changes --agent --task <id>` 可针对非当前 task 输出 selected task context 和 commit message 建议。
- [ ] AC-3: `changes --agent --scope <file>` 只针对显式 scope 文件生成归组/建议，未选中文件不会进入 recommended stage guidance。
- [ ] AC-4: 单 task 常规 closeout 的现有字段和 readiness/blocking 语义保持兼容。
- [ ] AC-5: human、agent YAML、JSON 输出均包含 task-aware 归组或 selection 摘要。
- [ ] AC-6: 覆盖 R-266/R-260 类似混合工作树回归场景。
- [ ] AC-7: `pnpm run build:test`、目标测试、`pnpm test`、`docpath check`、`docpath review`、`docpath journal` 通过。
