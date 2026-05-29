# DocPath — 文径工作流协议

> 本项目使用 **DocPath (文径)** 作为开发工作流引擎。
> **文档即有限状态机 (Document as FSM)** — 所有任务状态由 `.docpath/` 下的文档驱动。

---

## 🚨 首要指令

**你每次进入项目，必须按以下顺序执行：**

1. **STEP 0 — 读状态机**：先读取 `.docpath/workspace/current.md`，了解当前系统状态
2. **读面包屑**：如果存在 `.docpath/workspace/breadcrumb.md`，读取它以了解当前执行进度
3. **根据状态决定行为**：严格按照 `current.md → state` 字段决定你该做什么
4. **完成任务后更新状态**：修改 `current.md` 推进状态，更新 `breadcrumb.md`

> ⚠ **禁止**：跳过状态检查、凭记忆执行、不更新文档就结束会话。

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

### Level 1 状态

```yaml
states:
  idle:          等待任务输入
  task_created:  task.md 已创建，待执行
  executing:     正在执行任务
  verifying:     验证执行结果
  completed:     任务完成，已归档
```

### Level 2 状态

```yaml
states:
  idle:             等待任务
  brainstorming:    需求拷问中（输出 spec.md）
  spec_written:     spec.md 已就绪
  planning:         计划制定中（输出 plan.md）
  executing:        按 plan.md 执行子任务
  checking:         验证 + 测试
  reviewing:        代码审查（依据 style.md）
  journaling:       知识归档（输出 journal 条目）
  completed:        完成
```

### 状态转移规则

- 每个状态执行完毕后，**必须更新** `current.md` 中的 `state` 字段
- 状态推进必须按 DAG 顺序，**禁止跳状态**
- 状态卡住时（同状态停留超过预期），自动触发 `docpath:continue` 逻辑

---

## 📁 文档即契约

### 文档层级

```
.docpath/
├── config.yaml             ← 项目配置
├── spec/                   ← 全局规范（跨任务沉淀）
│   ├── architecture.md     ← 架构规范
│   ├── style.md            ← 代码风格
│   └── template/           ← 文档模板
├── tasks/T-YYYYMMDD-xxx/   ← 任务目录（沙盒隔离）
│   ├── spec.md             ← 任务规约
│   ├── plan.md             ← 执行计划（子任务清单）
│   ├── check.md            ← 验证记录
│   └── review.md           ← 审查记录
└── workspace/              ← 运行时状态
    ├── current.md          ← 当前状态（读写频繁）
    └── breadcrumb.md       ← 执行面包屑（断点续传）
```

### 文档第一性原则

1. **先文档，后代码**：任何改动前，确保对应的 spec/plan 文档存在
2. **执行写回文档**：任务执行中的关键决策、验证结果、发现需写回文档
3. **文档即验证**：任务完成的标准是文档都已更新到最终状态

---

## 🍞 面包屑协议 (Breadcrumb Protocol)

> 继承自 GSD 的上下文管理精华。每次执行子任务后必须更新 `breadcrumb.md`。

`breadcrumb.md` 格式：

```markdown
# 🍞 执行面包屑

## 当前会话
- 任务: T-20260528-xxx
- 当前 Phase: executing
- 当前子任务: 步骤 3/7 — 实现用户认证中间件

## 已完成
1. [✓] 步骤 1: 创建 spec.md — 已通过用户确认
2. [✓] 步骤 2: 设计数据模型 — User/Token/Session 三表
3. [▶] 步骤 3: 实现中间件逻辑 ← 当前

## 下一步快照
步骤 4: 编写单元测试
- 预期产出: tests/auth/middleware.test.ts
- 关键文件: src/auth/middleware.ts
- 背景: 需 mock JWT 验证函数

## 上下文快照
- 已做出的关键决策: 使用 async_local 存储用户上下文
- 待解决的问题: Token 刷新策略（步骤 6 处理）
- 风险项: JWT 密钥管理（步骤 7 处理）
```

---

## 🚀 中途升级机制 (Escalation Engine)

> 当你在 Level 1 执行过程中发现任务比预期复杂，**你有责任主动升级**。

### 触发条件

满足任意一条，触发升级：

- 发现需要改动 >3 个文件
- 发现涉及架构决策
- 发现需要调研外部库/API
- 发现当前文档不足以支撑正确执行

### 升级步骤

1. 在 `current.md` 中将 `level` 从 `1` 改为 `2`
2. 将 `state` 设为 `brainstorming`
3. 在 `breadcrumb.md` 中记录升级原因
4. 开始执行 Level 2 流程（brainstorm → spec → plan → 继续执行）

---



## 🤖 Agent Lifecycle Commands

For Codex / Claude Code / OpenCode, prefer these enforceable lifecycle commands over manual file edits:

```bash
docpath agent enter                         # start: load state + print agent context
docpath agent step --step "<sub-task>"      # after each meaningful step
docpath agent done --step "<task>"          # run check/review + record completion
docpath agent handoff                       # compact context before session switch
```

Rules:
- Run `docpath agent enter` before changing code.
- Run `docpath agent step` after each sub-task or major decision.
- Run `docpath agent done` before claiming completion.
- Run `docpath agent handoff` when context is getting long or another agent may resume.

---

## 🛠️ DocPath CLI 命令

| 命令 | 何时使用 | 说明 |
|------|---------|------|
| `docpath:init` | 项目首次 | 初始化 `.docpath/` 目录 |
| `docpath:brainstorm` | 需求模糊时 | 一问一答澄清需求 → 生成 spec.md |
| `docpath:plan` | spec 就绪后 | 从 spec.md 拆解为 plan.md |
| `docpath:go` | 计划就绪后 | 启动 subagent 执行 plan.md |
| `docpath:check` | 执行完成后 | 验证 + 测试 |
| `docpath:review` | 验证通过后 | 代码审查 |
| `docpath:journal` | 任务完成后 | 知识归档 → 更新全局 spec |
| `docpath:continue` | 断点续接 | 读 breadcrumb.md 恢复执行 |
| `docpath:status` | 随时 | 查看当前状态摘要 |

---

## ⚡ 执行纪律

### 必须做
- ✅ 每次工具调用前先读 `current.md` 确认状态
- ✅ 每个子任务完成后更新 `breadcrumb.md`
- ✅ 状态推进后更新 `current.md`
- ✅ **每完成一个子任务，立即勾选 `current.md` 中对应的 checklist 项（`[ ]` → `[x]`）**
- ✅ 先写文档再写代码（Level 1 以上）

### 禁止做
- ❌ 跳过状态检查直接执行
- ❌ 未更新文档就结束会话
- ❌ 跨状态跳跃（如直接从 executing 跳到 completed）
- ❌ 只在对话中记录决策，不写回文档

---

## 📐 关于本文件

这份 `CLAUDE.md` 由 `docpath:init` 自动生成。
它是 DocPath 工作流的宪法——定义了 Claude Code 与本项目的协作协议。

**当你在执行中感到迷茫时，重读此文件。**
