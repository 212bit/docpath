## 1. 目标与背景

目标是在不改变 DocPath 核心 FSM 的前提下，把首次初始化和日常 CLI 使用体验向产品化推进：用户可以通过 `docpath init --interactive` 在终端内完成项目名、复杂度级别、Agent 协议安装目标等关键选择；普通错误输出能给出原因、影响和可执行修复命令；文档提供一个从零到第一个任务的 getting started 路径。

已验证事实：当前 `initCommand` 支持 `--cwd`、`--force`、`--level`、`--link`，会自动检测项目信息、写 `.docpath` 目录、生成 rules/spec templates、写 `CLAUDE.md` 并注册项目；当前没有 `--interactive` 参数。测试 `tests/init.test.mjs` 只覆盖普通 init 和已有项目注册。

## 2. 用户/角色/触发场景

- 新用户：第一次在已有代码库运行 DocPath，希望知道选择什么 level、下一步运行什么命令、是否需要安装 Agent 协议文件。
- 日常用户：遇到 `.docpath` 已存在、参数错误、初始化目标不明确时，需要错误提示直接指向修复命令。
- Agent/自动化：仍需要保持非交互模式稳定，CI 或脚本不能被交互 prompt 阻塞。

## 3. 功能需求矩阵（需求/优先级/验收/依赖）

| 需求 | 优先级 | 验收 | 依赖 |
|---|---|---|---|
| `docpath init --interactive` | P0 | TTY 下出现交互式问题；非 TTY 下 fail-loud 并提示使用非交互参数 | `@clack/prompts` 已在依赖中 |
| 初始化交互式引导 | P0 | 可选择 level；可选择是否 force 覆盖；可选择是否安装 Agent 协议目标；保留现有自动检测输出 | init.ts |
| 更好的错误提示 | P1 | `.docpath` 已存在、目标无 `.docpath`、非法 level/非交互环境等场景包含修复建议 | init/register/core |
| Getting Started 文档 | P1 | 新增文档说明安装、初始化、创建 backlog、执行任务、验证和常见问题 | docs 或根文档路径 |
| 示例命令 | P1 | 文档中有可复制的最小命令序列，且不依赖网络 | CLI 现有命令 |

## 4. 非功能需求（性能/安全/合规/可观测性）

- 兼容性：默认 `docpath init` 行为不能变成交互式；只有显式 `--interactive` 才进入 prompt。
- 自动化安全：当 `--interactive` 在非 TTY 环境运行时，必须失败并给出非交互替代命令。
- 写操作边界：interactive 不应绕过现有 `--force` 保护；覆盖前必须明确确认。
- 可测试性：测试应覆盖 TTY 模拟、非 TTY fail-loud、普通 init 不回归。
- 文档稳定：getting started 使用当前真实命令，不引入未实现命令。

## 5. 范围边界与明确不做

包含：`init --interactive`、初始化相关错误提示、getting started 文档、测试。

不包含：重写全部 CLI 错误处理框架；实现全局 interactive wizard；改变 DocPath FSM；新增 Web UI；引入新依赖；修改所有命令的错误文案。
