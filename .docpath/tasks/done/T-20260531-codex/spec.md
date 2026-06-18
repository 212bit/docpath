# T-20260531-codex - 补齐 codex 安装目标的独立验收

> backlog_id: R-027
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档 `docs/design/next-phase-tasks.md` 的 P3 明确把 `codex|claude|opencode|universal` 列为对外承诺的安装目标。  

当前 `install` 的实现代码已经包含 `codex` target，但测试只显式验收了 `claude`、`opencode` 和 `universal`。`codex` 目前只在 `universal` 的组合路径里被间接覆盖，这会留下两个问题：

- 一旦 `codex` 独立 target 的行为偏离 `universal` 分支，现有测试不一定能及时暴露；
- 设计层承诺的是四个 target 都可直接使用，而不是“其中一个只在组合安装里顺便工作”。

本任务聚焦给 `install --target codex` 补充独立、可执行、可回归的验收测试，并在需要时修正实现，确保 Codex 安装目标本身是完整受保护的能力。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `install --target codex` 需有独立测试验证其生成的协议文件与配置文件集合。
- [ ] FR-2: 独立 codex 安装应生成 `AGENTS.md`、`CODEX.md` 与 `.codex/config.toml`，且不应误生成 `CLAUDE.md` 或 OpenCode 配置。
- [ ] FR-3: 生成的 Codex 配置需显式指向 `docpath status --agent` / `docpath next --agent`，与设计文档的 agent 协议要求一致。
- [ ] FR-4: 若现有实现与独立 codex 验收不一致，需同步修正实现而不是只放宽测试。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不回归 `claude`、`opencode` 与 `universal` 目标的安装行为。
- [ ] NFR-3: 测试需尽量复用现有 install harness，避免引入与目标无关的安装路径差异。

## 3. 范围界定

### 包含
- `install --target codex` 的独立测试覆盖
- 必要时的 `install` 实现修正
- 相关回归验证

### 不包含
- 扩展新的安装 target
- 改写协议模板整体内容
- 重构安装器结构

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | codex 验收策略 | 仅依赖 universal 间接覆盖 / 增加独立 codex 测试 | 增加独立测试 | 明确保护独立 target 合约，避免组合覆盖掩盖分支差异 |
| 3 | 修复策略 | 只改测试 / 测试驱动校正实现 | 测试驱动校正实现 | 设计要求是对外能力真实成立，而不是测试侥幸通过 |

## 5. 验收标准

- [ ] AC-1: `install --target codex` 有独立测试，验证输出文件集合与配置关键字段。
- [ ] AC-2: codex 独立安装不会误生成 `CLAUDE.md`、`.claude/commands`、`.opencode/docpath.json` 等非目标产物。
- [ ] AC-3: 现有 install 测试与全量回归通过。
- [ ] AC-4: 若 codex 独立目标存在实现偏差，修复后行为与测试一致。

---

*此文件由 `docpath backlog promote` 生成。*
