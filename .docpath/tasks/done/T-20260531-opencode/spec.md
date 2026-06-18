# T-20260531-opencode - 清理过时 OpenCode 协议模板并统一安装文案

> backlog_id: R-030
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档将 DocPath 定位为“多 Agent 共享的本地协议层”。经过前两轮任务，Claude、AGENTS/Codex 侧协议已经回到当前 CLI 语义，但 OpenCode 入口模板仍保留一套更早期的操作说明。

当前 `templates/OPENCODE.md` 的问题比较集中：

- 以 OpenCode 私有说明文案为主，没有明确把 `docpath status --agent` / `docpath next --agent` 作为首要入口；
- 示例命令包含 `docpath agent enter --step S1`、`docpath agent step --step S1 --status done --auto-next`、`docpath agent done --enforce` 等与当前统一协议不一致或未在现有安装验收中保护的写法；
- `install --target opencode` 会把该模板直接生成为目标项目的 `OPENCODE.md`，因此旧语义会直接暴露给用户。

这会破坏 P3 多 Agent 协议层的一致性，也使 OpenCode 用户看到的工作流与 Claude/Codex 已统一的生命周期规范不一致。

本任务聚焦清理过时的 OpenCode 协议模板，并补强安装相关测试，确保 OpenCode 安装入口与当前 DocPath 生命周期约束一致。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 更新 `templates/OPENCODE.md`，使其明确要求先读 `docpath status --agent` / `docpath next --agent`，再按当前 agent lifecycle 推进。
- [ ] FR-2: OpenCode 协议模板不得再依赖过时、未统一或未经当前 CLI 约束保护的命令示例。
- [ ] FR-3: `install --target opencode` 生成的 `OPENCODE.md` 必须与当前统一协议语义一致。
- [ ] FR-4: 安装相关测试需显式覆盖 OpenCode 协议入口文案的关键断言，防止回归。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改动 `.opencode/docpath.json` 目录结构或 target 行为，只统一入口协议真源与测试护栏。
- [ ] NFR-3: 回归验证需串行执行，避免 `dist/` 清理造成测试不稳定。

## 3. 范围界定

### 包含
- 清理过时 OpenCode 协议模板并统一安装文案
- `templates/OPENCODE.md` 的协议语义修正
- install 测试补强

### 不包含
- 重构 OpenCode 配置 JSON 结构
- 引入新的 OpenCode 专属命令系统
- 修改与本任务无关的 Claude/Codex/AGENTS 协议内容

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | OpenCode 协议统一策略 | 保留旧入口文案 / 统一到当前 DocPath 生命周期语义 | 统一到当前生命周期语义 | 多 Agent 协议层必须共享同一套可执行约束 |
| 3 | 回归保护方式 | 只人工检查 / 扩展 install 自动化断言 | 扩展自动化断言 | `OPENCODE.md` 是安装产物，需要长期防回归护栏 |

## 5. 验收标准

- [ ] AC-1: `templates/OPENCODE.md` 明确要求先读 `docpath status --agent` 或 `docpath next --agent`，再使用当前 lifecycle 命令推进。
- [ ] AC-2: OpenCode 协议模板不再保留与当前统一协议不一致的旧流程示例。
- [ ] AC-3: `install --target opencode` 生成的 `OPENCODE.md` 与当前协议语义一致，并被测试覆盖。
- [ ] AC-4: install 目标测试、全量测试、`docpath check` 通过，任务状态闭环完成。

---

*此文件由 `docpath backlog promote` 生成。*
