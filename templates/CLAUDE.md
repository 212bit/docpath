# DocPath — 文径工作流协议

> 本项目使用 **DocPath (文径)** 作为开发工作流引擎。
> **文档即有限状态机 (Document as FSM)** — 所有任务状态由 `.docpath/` 下的文档驱动。

---

## 🚨 首要指令

**你每次进入项目，必须按以下顺序执行：**

1. **STEP 0 — 读状态机**：优先使用 `/docpath-status` 或运行 `docpath status --agent`。
2. **路由下一步**：优先使用 `/docpath-next` 或运行 `docpath next --agent`。
3. **根据 recommended_command 行动**：不要凭记忆选择下一步。
4. **完成步骤后记录**：使用 `/docpath-agent-step`，不要手工改状态文件。
5. **完成任务前走门禁**：使用 `/docpath-agent-done`。

> ⚠ **禁止**：跳过状态检查、凭记忆执行、手工编辑 state.json/current.md。

> ⚠ **需求澄清门禁**：当用户提出页面、Dashboard、流程可视化、数据视图、工作台等产品/UI 形态需求，但未明确目标用户、入口位置、数据范围或交互方式时，必须先澄清或进入 brainstorm/refine，不得直接创建任务、promote backlog 或写代码。

> ⚠ **重大变更门禁**：当请求可能改变技术栈、架构/模块边界、数据模型/API 契约、UI 信息架构/用户主路径、工作流/Agent 行为、权限或写操作边界、任务范围、已有能力或长期维护成本时，必须先进入 brainstorm/refine，在任务 spec 写 Decision Brief 并等待用户明确确认；确认前不得 promote 实现任务或写实现代码。

## Claude Code Slash Commands

安装 Claude 适配后，优先使用这些 `/` 命令，而不是复制长提示词：

```text
/docpath-init                # 初始化 .docpath/ 目录
/docpath-status              # 查看当前状态摘要（状态机）
/docpath-next                # 获取下一步机器路由
/docpath-agent-enter         # 进入 DocPath 管理会话，加载状态
/docpath-agent-step S1       # 记录步骤完成并同步 plan/breadcrumb
/docpath-agent-done task     # 完成任务并运行 check/review/journal
/docpath-agent-handoff       # 生成交接包，压缩上下文
/docpath-check               # 运行质量门禁
/docpath-review              # 代码审查
/docpath-brainstorm          # 需求拷问 → 生成 spec.md
/docpath-plan                # 从 spec.md 拆解为 plan.md
/docpath-go                  # 启动 subagent 执行 plan.md
/docpath-journal             # 知识归档
/docpath-continue            # 断点续接
/docpath-compact             # 持久化压缩上下文
/docpath-refine              # 需求文档 → 规范化需求信息
```

这些命令都指向同一个 `.docpath/` 真源；不要维护另一套 Claude 专用状态。

---

## 📊 四级复杂度模型

| Level | 名称 | 触发条件 | 文档要求 | 流程 |
|-------|------|---------|---------|------|
| **L0** | 即时响应 | 1-2 步，无歧义，不跨文件 | 无 | 直接执行 |
| **L1** | 轻量任务 | 3-5 步，单文件改动 | `task.md` | 任务→执行→验证→归档 |
| **L2** | 标准任务 | 多文件，有设计决策，需调研 | `spec.md` → `plan.md` | 调研→规约→计划→执行→验证→审查 |
| **L3** | 复杂任务 | 跨模块/跨会话/多人协作 | 完整生命周期 | 含设计、并行子代理、跨会话归档 |

**复杂度由 `docpath` CLI 评估并写入 `current.md`**。但你在执行中发现当前 Level 不足时，应触发**中途升级**（见下文）。

---

## 🔄 状态机定义

> **状态由 DocPath CLI 自动管理**。Agent 不应手工编辑 state.json 或 current.md 中的 state 字段。
> 使用 `/docpath-agent-step` / `/docpath-agent-done` 触发状态转移。

### 工作流阶段

```yaml
phases:
  idle:           等待任务
  drafting:       需求/规格编写中（brainstorm/refine/plan）
  executing:      按 plan.md 执行子任务
  checking:       验证 + 测试（check gate）
  completed:      任务完成，已归档
```

### Gate 状态

```yaml
gates:
  pending:        检查未执行
  passed:         检查通过
  failed:         检查失败，需修复
```

### 状态转移规则

- 状态转移由 `docpath-agent-step` / `docpath-agent-done` 内部调用 `transitionWorkflow()` 自动完成
- **禁止**手工编辑 state.json 的 phase/gate 字段
- 状态卡住时，使用 `/docpath-next` 获取路由建议

---

## 📁 文档即契约

### 文档层级

```
.docpath/
├── config.yaml             ← 项目配置
├── rules/                  ← 全局规则（跨任务沉淀）
│   ├── architecture.md     ← 架构规范
│   └── style.md            ← 代码风格
├── spec/template/          ← 文档模板（兼容旧模板目录）
├── tasks/T-YYYYMMDD-xxx/   ← 任务目录（沙盒隔离）
│   ├── spec.md             ← 任务规约
│   ├── plan.md             ← 执行计划（子任务清单）
│   ├── check.md            ← 验证记录
│   └── review.md           ← 审查记录
└── workspace/              ← 运行时状态
    ├── current.md          ← state.json 的渲染视图
    └── breadcrumb.md       ← 执行面包屑（断点续传）
```

### 职责边界

- `backlog/`：候选需求池，负责优先级、接收与 promote 前状态。
- `tasks/`：任务真源，负责当前任务的 spec、plan、review 与归档材料。
- `workspace/`：运行态与证据，`current.md` 只读展示 `state.json`，不作为任务真源。
- `rules/`：全局规范，负责跨任务的 style、architecture 与 learned conventions。

### 文档第一性原则

1. **先文档，后代码**：任何改动前，确保对应的任务 spec/plan 文档存在
2. **执行写回文档**：任务执行中的关键决策、验证结果、发现需写回文档
3. **文档即验证**：任务完成的标准是文档都已更新到最终状态

---

## 🤖 Agent Lifecycle Commands

For Codex / Claude Code / OpenCode, use these enforceable lifecycle commands:

```bash
docpath agent enter                         # load state + print agent context
docpath agent step --step "<sub-task>"      # after each meaningful step
docpath agent done --step "<task>"          # run check/review + record completion
docpath agent handoff                       # compact context before session switch
```

**Workflow:**
1. `docpath agent enter` → 读取状态，输出 agent_context
2. 做代码改动
3. `docpath agent step --step "完成xxx"` → 自动标记 plan checklist + 写 breadcrumb
4. 重复 2-3 直到所有子任务完成
5. `docpath agent done --step "任务名"` → 自动跑 check + review + 记录完成
6. 需要切换会话时: `docpath agent handoff` → 压缩上下文

---

## 🛠️ DocPath CLI 命令

| 命令 | 何时使用 | 说明 |
|------|---------|------|
| `docpath init` | 项目首次 | 初始化 `.docpath/` 目录 |
| `docpath status` | 随时 | 查看当前状态摘要 |
| `docpath next` | 随时 | 获取下一步路由建议 |
| `docpath brainstorm` | 需求模糊时 | 一问一答澄清需求 → 生成 spec.md |
| `docpath refine` | 有需求文档时 | 从需求文档生成规范化 spec.md |
| `docpath plan` | spec 就绪后 | 从 spec.md 拆解为 plan.md |
| `docpath go` | 计划就绪后 | 启动 subagent 执行 plan.md |
| `docpath agent enter` | 开始工作 | 进入管理会话 |
| `docpath agent step` | 每步完成 | 记录步骤 + 同步 plan |
| `docpath agent done` | 任务完成 | check/review/journal 闭环 |
| `docpath agent handoff` | 切换会话 | 压缩上下文生成交接包 |
| `docpath check` | 执行完成后 | 质量门禁 |
| `docpath review` | 验证通过后 | 代码审查 |
| `docpath journal` | 任务完成后 | 知识归档 |
| `docpath continue` | 断点续接 | 读 breadcrumb 恢复执行 |
| `docpath compact` | 上下文长时 | 持久化压缩 |

---

## ⚡ 执行纪律

### 必须做
- ✅ 每次进入项目先运行 `docpath status` 确认状态
- ✅ 使用 `docpath agent step` 记录每个子任务完成
- ✅ 使用 `docpath agent done` 触发质量门禁
- ✅ 每完成一个子任务，plan.md 中对应 checklist 项由 agent step 自动标记为 `[x]`

### 禁止做
- ❌ 手工编辑 state.json 或 current.md 的 state/phase/gate 字段
- ❌ 跳过状态检查直接执行
- ❌ 在对话中记录决策但不写回文档

---

## 📐 关于本文件

这份 `CLAUDE.md` 由 `docpath init` 自动生成。
它是 DocPath 工作流的宪法——定义了 Claude Code 与本项目的协作协议。

**当你在执行中感到迷茫时，重读此文件。**
