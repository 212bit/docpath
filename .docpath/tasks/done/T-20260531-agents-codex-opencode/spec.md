# T-20260531-agents-codex-opencode - 清理过时 AGENTS 协议模板并统一 Codex/OpenCode 协议文案

> backlog_id: R-029
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档把 DocPath 定位为“多 Agent 共享的本地协议层”，这意味着 Claude、Codex、OpenCode 三端安装资产都必须指向同一套当前工作流语义，而不能残留历史协议。

上一轮已经修复了 Claude 侧协议漂移，但当前仓库仍存在同类残留：

- `templates/AGENTS.md` 已更新为当前 DocPath 协议；
- 但 `templates/protocols/AGENTS.md` 仍是旧版协议，仍描述 `docpath go "description"`、手工更新 `current_step`、`docpath archive` 等历史流程；
- `install --target codex` / `install --target universal` 会把 `templates/protocols/AGENTS.md` 复制到目标项目的 `.docpath/protocols/AGENTS.md`，导致安装产物重新暴露旧语义。

这会破坏 P3“多 Agent 共享同一协议层”的一致性，也会让 Codex/OpenCode 读取 `.docpath/protocols/AGENTS.md` 时看到与当前 CLI 不一致的行为规范。

本任务聚焦清理过时的 AGENTS 协议模板，并为 Codex / OpenCode 安装路径补回归测试，确保不同 Agent 入口与 `.docpath/protocols/` 参考协议维持同一真源。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 更新 `templates/protocols/AGENTS.md`，移除对历史工作流和失效命令的描述，使其与当前 DocPath 生命周期一致。
- [ ] FR-2: AGENTS 协议需明确要求先读 `docpath status --agent` / `docpath next --agent`，再通过 `docpath agent enter/step/done/handoff` 推进。
- [ ] FR-3: `install --target codex` 与 `install --target universal` 生成的 `.docpath/protocols/AGENTS.md` 不得回归到旧协议语义。
- [ ] FR-4: 安装相关测试需显式覆盖 AGENTS 协议模板与安装产物，防止 Codex/OpenCode 侧再次漂移。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不改动安装目录结构与现有 target 行为，只统一协议真源与测试护栏。
- [ ] NFR-3: 回归验证需串行执行，避免与 `dist/` 清理相关的随机失败。

## 3. 范围界定

### 包含
- 清理过时 AGENTS 协议模板并统一 Codex/OpenCode 协议文案
- `templates/protocols/AGENTS.md` 与仓库内参考协议的一致性修正
- install / 模板测试补强

### 不包含
- 重写所有 Agent 模板的整体风格
- 新增安装 target 或重构 install 目录布局
- 修改与本任务无关的 Claude 协议内容

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | AGENTS 协议统一策略 | 保留旧协议作历史遗留 / 统一到当前生命周期语义 | 统一到当前生命周期语义 | `.docpath/protocols` 是安装资产，不能继续输出过时工作流 |
| 3 | 回归保护方式 | 只人工检查 / 扩展 install 自动化断言 | 扩展自动化断言 | 安装产物属于长期稳定面，必须有测试护栏 |

## 5. 验收标准

- [ ] AC-1: `templates/protocols/AGENTS.md` 不再描述 `docpath archive`、手工更新状态等旧协议语义。
- [ ] AC-2: AGENTS 协议内容明确要求先读 `docpath status --agent` 或 `docpath next --agent`，再使用 agent lifecycle 命令推进。
- [ ] AC-3: `install --target codex` 或 `universal` 生成的 `.docpath/protocols/AGENTS.md` 与当前协议语义一致。
- [ ] AC-4: install 相关目标测试、全量测试、`docpath check` 通过，任务状态闭环完成。

---

*此文件由 `docpath backlog promote` 生成。*
