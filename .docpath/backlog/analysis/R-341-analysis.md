# R-341 分析：协议文件单一真源与瘦客户端重构（2026-09-12）

## 现状与问题分析

当前 `docpath install --target universal` 或在 DocPath 自身仓库中维护 4 个全量协议文件：
- `AGENTS.md` (~10KB, 185 行)
- `CLAUDE.md` (~10.5KB, 234 行)
- `CODEX.md` (~6.4KB, 159 行)
- `OPENCODE.md` (~7.5KB, 185 行)

85% 以上内容（First Steps、Access Model、Command Boundaries、Lifecycle、Worktree Isolation、Required Gates、Token 预算等）跨文件重复。
带来的痛点：
1. **跨端维护漂移地狱**：每次规范演进（如 fe00b74 增加轻量化分级准则），需同步修改 3~4 处模板与根文件，极易漏改或分叉。
2. **根目录污染与上下文爆炸**：多协议共存导致项目根目录臃肿，部分 Agent 自动加载自身协议时消耗过多初始 Token。

## 方案设计

### 1. AGENTS.md 确立为全局唯一完备协议真源
- `templates/protocols/AGENTS.md` 与根目录 `AGENTS.md` 作为唯一完备规范载体。
- 补齐 AGENTS.md 的缺失段落（补全 `## Worktree Concurrent Development` 章节，内嵌 `<!-- docpath:block worktree-isolation -->`）。
- 确保涵盖 First Steps、Access Model、Command Boundaries、Project Context、Agent Lifecycle Commands、Lightweighting & Token Economy Rules、Lifecycle Rules、Required Gates、Worktree Concurrent Development、Useful Commands、Decision Log Aging、Linked Project。

### 2. CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行）
- **CLAUDE.md**：
  - 核心说明：指向 `@AGENTS.md` 为真源；
  - 专属能力：保留 Claude Code 专属斜杠命令清单（`/docpath-status`, `/docpath-next`, `/docpath-quick`, ...）；
  - 行数严格控制在 30 行以内。
- **CODEX.md**：
  - 核心说明：指向 `@AGENTS.md` 为真源；
  - 补充说明：Codex 优先读取 `AGENTS.md`，本文件仅作为 fallback；
  - 行数严格控制在 30 行以内。

### 3. 安装与校验逻辑调整
- **安装目标**：
  - `target === 'claude'` 原先仅安装 `CLAUDE.md`。因 `CLAUDE.md` 引用 `@AGENTS.md`，必须同时安装 `AGENTS.md`，使 `entryProtocolFiles('claude')` 返回 `['AGENTS.md', 'CLAUDE.md']`。
  - `target === 'codex'` 保持 `['AGENTS.md', 'CODEX.md']`。
  - `target === 'universal'` 保持 4 文件安装。
- **协议块同步校验（protocol-blocks / render）**：
  - `CLAUDE.md` 与 `CODEX.md` 降级为瘦代理后，不再包含 `lifecycle-commands` 或 `worktree-isolation` 注入块。
  - `renderProtocolBlocks` 在无块时返回 `present: []`，校验保持幂等。
  - `AGENTS.md` 包含 `lifecycle-commands` 与 `worktree-isolation`。
  - `OPENCODE.md` 保持现有结构与 `worktree-isolation` 块。
  - 更新 `templates/protocols/blocks/README.md` 中的块覆盖面说明。

### 4. 测试与清单保障
- 更新 `tests/render.test.mjs`：块覆盖面断言调整（AGENTS.md 覆盖 lifecycle-commands 与 worktree-isolation，CLAUDE/CODEX 为瘦代理无块）；
- 新增断言：`CLAUDE.md` 与 `CODEX.md` 行数 < 30 行，且显式包含 `@AGENTS.md`；
- 更新 `tests/install.test.mjs`：调整对 `CLAUDE.md` 与 `CODEX.md` 的内容断言，确认 claude 安装目标包含 `AGENTS.md`；
- 保持所有现有测试及 install manifest 校验通过。
