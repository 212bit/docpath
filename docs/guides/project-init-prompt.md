---
kind: reference
scope: project
level: 2
status: active
related:
  - getting-started.md
  - ../features/worktree-workflow.md
---

# 新建项目 DocPath 初始化 Prompt（复制即用）

给「新项目要不要接 DocPath、怎么接」提供一份**可直接粘贴给 Agent 的初始化指令**，以及一份经本仓库实测校准的命令事实卡。

适用对象：新项目仓库（空仓或刚 `git init` 的脚手架），目标是把 DocPath 工作流一次性装到「Agent 能独立跑完一个任务闭环」的程度。

---

## 1. 主 Prompt（推荐，整段复制）

```text
【任务】把当前仓库接入 DocPath 工作流并完成一次初始化验证。只做初始化与验证，不要顺手写业务功能。

【硬约束】
- 不要自行发明 CLI 参数：不确定的命令必须先 `docpath <cmd> --help` 或 `node bin/docpath.js <cmd> --help` 确认。
- 不要手编 `.docpath/workspace/state.json` / `current.md` / `breadcrumb.md`；所有状态变更只能经由 docpath 命令。
- 不要手改 `spec.md` 的验收勾选来"制造完成"，进度由 plan.md + `docpath step-pass` 驱动。
- 边做边报告：每个阶段给出「执行的命令 → 实际输出摘要 → 结论」，失败就停下来说明，不要静默改用别的路径。

【执行步骤】
S0. 前置探测并回报（不要修改任何文件）：
    - 运行 `pwd`、`git rev-parse --is-inside-work-tree`、`git status --porcelain | wc -l`。
    - 报告：项目类型/语言/包管理器、现有测试与构建命令、当前工作区是否干净、是否已有 `.docpath/`。
    - 若已存在 `.docpath/`：停止所有破坏性动作，改为报告现状并调用 `docpath next --agent`。

S1. 确认可用 CLI：
    - 优先用仓库本地 CLI；若仓库内有 `bin/docpath.js`，用 `node bin/docpath.js --version`；
      否则用 PATH 上的 `docpath --version`。确认版本后再继续。
    - `docpath --help` 看一遍命令面，注意 `docpath help advanced` 里有隐藏命令。

S2. 初始化：
    - 新项目（无 `.docpath/`）：`docpath init --scan-existing --level <L>`
      其中 L 取值由 S0 探测结果决定：单一脚本/小工具=1，常规应用=2（默认），多模块/跨服务架构=3。
      `--scan-existing` 会扫描真实目录结构生成 `rules/architecture.md`，并从 package.json / Cargo.toml /
      go.mod / pom.xml / Makefile 提取 test/build/format/lint 命令写入 `CLAUDE.md` 的「项目命令」区块。
    - 需要人工确认 level 时才用 `docpath init --interactive`（需要 TTY，Agent 环境通常不可用）。

S3. 安装 Agent 协议资产：`docpath install --target universal`
    （会生成 `.docpath/bin/docpath` 本地 shim、`.docpath/protocols/`、`.codex/`、`.claude/commands/`、`.opencode/`）
    安装后运行 `docpath install --check-only` 核对资产漂移。
    ⚠️ 已知问题（本仓库实测）：`--scan-existing` 先写 CLAUDE.md 区块、随后 install 写协议模板，
    必然产生 1 项 "CLAUDE.md 模板漂移"告警（install 不会覆盖带「项目命令」区块的文件，区块内容安全）。
    处理方式：只回报这一条已知告警，**不要**用 `--force` 覆盖（会丢掉提取到的项目命令）。

S4. 项目基线提交（关键，决定后续命令能否跑通）：
    - 把初始化产物提交成一次基线 commit，例如：
      `git add -A && git commit -m "chore: docpath init baseline"`
    - 确认 `git status --porcelain` 为空。原因：`docpath start` 拒绝在 dirty worktree 上启动任务，
      且未提交的 `.docpath/rules/**` 会触发「重大变更门禁」。

S5. 建立文档索引：`docpath docs scan`，然后 `docpath docs doctor` 看健康度；
    若项目已有 `docs/`、`README.md` 之外的文档目录，登记进 `.docpath/config.yaml` 的 `document_scan_paths`
    （白名单语义：未声明的目录不会被扫描，会表现为"假绿"）。

S6. 回填真实项目元信息：
    - 检查 `.docpath/config.yaml` 的 `project.description` / `type` / `language` / `framework` 是否与项目实际相符，
      不符就用编辑器修正（这是配置，不是 runtime 状态，允许手改）。
    - 检查 `CLAUDE.md`「项目命令」区块里标了 `TODO` 的槽位（format/lint 等），
      能确认的补上真实命令，不能确认的在报告里列出来问用户，**不要编造命令**。

S7. 闭环验证（必须真的跑完，不是走查）：
    - `docpath backlog add --title "<一个真实的小需求>" --priority P2 --level 1 --background "..." --acceptance "..."`
    - `docpath start "<同一需求>" --draft`
    - 按 next_hint 执行 `docpath go --step S1`，为该步骤做一个真实的最小改动
    - `docpath step-pass --commit`（收口：单步验证 + check + review + journal + commit）
    - 收尾确认 `docpath next --agent` 回到 idle 或给出下一个可执行路由。

S8. 汇报（结构化，不要贴大段命令输出）：
    1) 改了哪些文件（路径 + 一句话作用）
    2) 跑通了哪些命令（命令 → 结果）
    3) 遇到的问题与处置（含上面的 CLAUDE.md 已知告警）
    4) 需要用户确认的待办（TODO 命令、level 是否合适、document_scan_paths 是否要扩）
    5) 下一步建议

【完成判据】S7 的闭环真实跑通 && `git status` 干净 && 报告里没有未说明的失败项。
```

---

## 2. 精简版 Prompt（已有脚手架的存量项目）

```text
把当前已有项目接入 DocPath：先 `docpath init --scan-existing --level 2`（已存在 .docpath/ 时改用
`docpath init --cwd .`，只注册不覆盖），再 `docpath install --target universal`；
检查并修正 `.docpath/config.yaml` 的项目元信息与 `CLAUDE.md`「项目命令」区块的 TODO 槽位；
把初始化产物提交成一次基线 commit 后再 `docpath docs scan`；
最后用 `docpath backlog add` + `docpath start <id> --draft` + 一个最小真实改动 + `docpath step-pass --commit`
验证闭环。全程不要发明 CLI 参数，不确定就查 `--help`；不要手编 state.json / current.md。
```

增量接入已有 `.docpath/` 的项目时，`init` 的默认行为是**注册项目 + 修复缺失 runtime**，不覆盖工作区文件；只有确认要重建才用 `--force`。

---

## 3. 命令事实卡（本仓库实测）

| 用途 | 命令 | 实测要点 |
| --- | --- | --- |
| 初始化（含扫描） | `docpath init --scan-existing --level 2` | 生成 config.yaml / rules / spec 模板 / workspace / CLAUDE.md；从 manifest 提取命令写进 CLAUDE.md 区块 |
| 初始化（纯模板） | `docpath init --level 2` | 同上，但 `rules/architecture.md` 是空模板，不反映真实结构 |
| 交互初始化 | `docpath init --interactive` | **需要 TTY**，非 TTY 会直接抛错 |
| 已有项目注册 | `docpath init --cwd <path>` | 不覆盖已有 `.docpath/`，只注册 + 补 runtime |
| 重建 | `docpath init --force --level 2` | 唯一会覆盖已有初始化文件的路径 |
| 安装协议资产 | `docpath install --target universal` | 生成 `.docpath/bin/docpath` shim（绝对路径）、`.codex/`、`.claude/commands/`、`.opencode/` |
| 资产体检 | `docpath install --check-only` / `--doctor` | 有漂移时 exit 非 0，属预期 |
| 状态路由 | `docpath next --agent`（`--compact` 更省 token） | 只读；结尾 `next_hint` 就是下一步，**不要每条命令后重跑** |
| 状态快照 | `docpath status --agent` | 只在显式查看/诊断漂移时用 |
| 建需求 | `docpath backlog add --title --priority --level --background --acceptance` | 也可先 `backlog capture` 存 raw |
| 拉起任务 | `docpath start "<title>" --draft` | 复合：promote backlog + 生成 spec/plan + 启动 S1；dirty worktree 会拒绝 |
| 认领脏改动 | `docpath start "<title>" --draft --adopt` | 单 agent 串行开发、已有未提交代码时用 |
| 执行步骤 | `docpath go --step S1` | 原子认领/切换到计划步骤 |
| 单步收口 | `docpath step-pass --commit` | 单步验证 + 收口提交；`--test <path>` 指定靶向单测 |
| 任务收口 | `docpath done --commit` | check → review → journal → commit 一次跑完 |
| 微型改动 | `docpath quick "<title>" --commit` | < 50 行、typo、单点修复的快车道；调度器/核心引擎类改动禁用 |
| 文档索引 | `docpath docs scan` / `docs doctor` / `docs fix` | 索引落 `.docpath/docs-index.json`；外部文档取决于 `document_scan_paths` |
| 架构边界 | `docpath arch check` | 边界与防腐检查 |

### 三个高频坑（都实测复现过）

1. **dirty worktree 拒绝启动**：`docpath start` 在有未提交改动时报错（实测 139 个文件被拦）。
   正解：先 baseline commit，或用 `--adopt`。不要用 `task reset/abort` 去绕过。
2. **未提交的 rules 触发重大变更门禁**：`.docpath/rules/architecture.md`、`style.md` 未提交时，
   `docpath plan` 会判定"检测到未提交的重大变更"并要求 `write-spec` 填 Decision Brief。
   正解：初始化产物先提交，门禁自动跳过。
3. **init + install 的 CLAUDE.md 漂移告警是已知噪声**：`--scan-existing` 写入「项目命令」区块，
   install 随后写入协议模板，二者必然差异 1 项。不要 `--force` 覆盖，否则丢失提取到的真实命令。

### 非致命噪声

- `init` 末尾可能打印 `attempt to write a readonly database`（本地项目中心 registry 在沙箱/只读 HOME 下写失败）。
  **不影响 `.docpath/` 初始化结果**，脚本/Agent 环境可忽略，不需要重跑 init。
- CLI 有两个入口事实：PATH 上的全局 `docpath` 与仓库内 `bin/docpath.js` 可能不同版本；
  仓库内验证请显式用 `node bin/docpath.js <command>`。

---

## 4. 验收清单

- [ ] `.docpath/` 全套目录生成，`rules/architecture.md` 反映真实目录结构（用了 `--scan-existing`）
- [ ] `.docpath/config.yaml` 项目元信息准确，`document_scan_paths` 覆盖实际文档目录
- [ ] `CLAUDE.md`「项目命令」区块无编造命令，TODO 项已向用户确认
- [ ] `docpath install --check-only` 仅剩已知的 CLAUDE.md 漂移项
- [ ] `docpath docs scan` 生成的索引包含外部项目文档
- [ ] 完成一次真实的 `backlog → start → go → step-pass --commit` 闭环
- [ ] `git status` 干净，初始化一次成型的 baseline commit 已存在
