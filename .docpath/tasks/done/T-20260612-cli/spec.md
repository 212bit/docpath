# T-20260612-cli - 产品化 CLI 体验与交互式初始化

> backlog_id: R-156
> analysis: .docpath/tasks/current/analysis/

## 1. 背景与动机

DocPath 当前 `init` 已能自动检测项目并生成 `.docpath` 工作流目录，但首次使用者仍需要自己判断复杂度 level、已有 `.docpath` 时如何处理、下一步应该运行什么命令。用户明确要求推进产品化方向：改进 CLI 用户体验、完善文档和示例，并添加 `docpath init --interactive`。

本任务以 MVP 方式提升初始化体验：默认非交互路径保持兼容；新增显式交互路径帮助新用户完成初始化决策；初始化相关错误提示提供可执行修复建议；新增 getting started 文档覆盖从零到第一个任务的最小闭环。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath init` 新增 `--interactive` 参数，显式进入交互式初始化流程。
- [ ] FR-2: interactive 模式在 TTY 下展示项目检测摘要，并允许用户选择复杂度 level，默认使用自动检测值。
- [ ] FR-3: interactive 模式遇到已有 `.docpath` 时，默认只注册现有项目，不覆盖；只有用户明确确认 force 时才重建。
- [ ] FR-4: interactive 模式在非 TTY 环境下 fail-loud，不挂起，并提示等价非交互命令。
- [ ] FR-5: 初始化相关错误提示改进，至少覆盖 `.docpath` 已存在、link 目标无 `.docpath`、非法 level、interactive 非 TTY 或取消。
- [ ] FR-6: 新增 getting started guide，说明安装/初始化、交互式初始化、第一个 backlog、执行计划、检查与常见问题。
- [ ] FR-7: 测试覆盖普通 init 不回归、interactive 非 TTY fail-loud、interactive TTY 最小路径、已有项目 interactive 不覆盖、getting started 文档关键命令。

### 非功能需求
- [ ] NFR-1: 默认 `docpath init` 行为保持非交互，不影响 CI、脚本和 Agent。
- [ ] NFR-2: 不新增第三方依赖；复用项目已有 `@clack/prompts`。
- [ ] NFR-3: interactive 不改变 DocPath 状态机、backlog 流程或任务生命周期。
- [ ] NFR-4: 覆盖型写操作默认从严，不因交互模式绕过 `--force` 保护。
- [ ] NFR-5: 文档示例必须使用当前真实 CLI 命令，不包含未实现命令。

## 3. 范围界定

### 包含
- `src/commands/init.ts` 的交互式初始化流程和初始化错误提示增强。
- `src/commands/register/core.ts` 注册 `--interactive` 参数并校验 level。
- `docs/getting-started.md` 或等价文档路径。
- `tests/init.test.mjs` 和文档关键命令测试。

### 不包含
- 不实现全局 CLI wizard。
- 不重写所有命令的错误处理框架。
- 不自动调用 `docpath install` 写入 Agent 协议文件；只提示后续命令。
- 不修改 DocPath FSM、backlog 状态机或 Dashboard。
- 不实现 Web UI。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | interactive 触发方式 | 默认交互 / 显式参数 | 显式 `--interactive` | 保持脚本和 Agent 兼容 |
| 2 | 已有 `.docpath` 处理 | 默认覆盖 / 默认注册 | 默认注册 | 避免破坏用户工作区 |
| 3 | Agent 协议安装 | init 内自动安装 / 输出下一步命令 | 输出下一步命令 | 避免扩大写操作边界 |
| 4 | 文档范围 | 完整手册 / getting started | getting started | 降低 MVP 范围，聚焦首次成功路径 |

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
- 当前问题: 首次使用者需要自行判断 init level、已有项目处理方式和下一步命令，初始化错误提示不够产品化。
- 目标: 新增显式 interactive 初始化路径，改进初始化错误提示，补充 getting started，让用户能完成从初始化到第一个任务的最小闭环。
- 背景: `initCommand` 已有自动检测和文件生成能力，但没有交互流程；`@clack/prompts` 已是现有依赖。
- 可选方案: A 只写文档；B 只做 `init --interactive` MVP；C 做全局 wizard。
- 推荐方案: B + getting started；默认 init 不变，interactive 只处理初始化关键决策。
- 不做什么: 不实现全局 wizard，不自动执行 install 写操作，不重写 FSM，不新增依赖。
- 成本: 修改 init/register、补测试、补文档。
- 风险: prompt 在非 TTY 挂起；用户误覆盖 `.docpath`；文档示例漂移。
- 回滚方案: 保留普通 init；必要时隐藏 `--interactive` 或让其只打印非交互建议。
- 用户确认: 用户已明确要求“继续，新增backlog，并执行”，并列出产品化方向。

## 4.2 UI 设计门禁

- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

说明：本任务涉及终端 CLI 交互文案，不新增 Web 页面或可视化产品 UI。

## 5. 验收标准

- [ ] AC-1: `docpath init --interactive` 在 TTY 下可完成最小初始化，生成 `.docpath/config.yaml`、`workspace/state.json`、rules、templates，并注册项目。
- [ ] AC-2: `docpath init --interactive` 在非 TTY 下失败且输出非交互替代命令，不写入半成品。
- [ ] AC-3: 已存在 `.docpath` 时 interactive 默认只注册，不覆盖已有 `workspace/current.md`。
- [ ] AC-4: `docpath init --level <n>`、普通 `docpath init`、`docpath init --link` 现有行为不回归。
- [ ] AC-5: 初始化相关错误提示包含修复建议，例如 `--force`、`--level`、`docpath init --cwd` 或 link 目标初始化提示。
- [ ] AC-6: getting started 文档包含 `docpath init --interactive`、非交互 init、backlog add/accept/promote、plan/go/check 的示例路径。
- [ ] AC-7: `pnpm run typecheck`、`node --test tests/init.test.mjs` 和相关文档测试通过；收口时按风险运行更广测试。

## 6. 风险与依赖

- 依赖 `@clack/prompts` 的 TTY 行为；必须 guard 非 TTY。
- 交互式测试可能不稳定，优先使用 PTY 或最小 stdin 驱动。
- `.docpath` 覆盖风险必须由默认注册和明确确认缓解。
- 文档示例要跟随真实 CLI 参数，避免未来漂移。

## 7. 后续工作流

- 运行 `docpath plan` 生成执行计划。
- 先实现 init interactive 与错误提示，再补 getting started 和测试。
- 完成后运行 typecheck、聚焦测试，并按 DocPath check/review/journal 收口。
