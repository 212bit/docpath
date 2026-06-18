# 执行计划: Phase 2 — 动态升级引擎与 GSD 上下文编排

**基于**: spec.md (v1.0)
**预计工作量**: ~8 个子任务

## 实现策略

5 个功能模块按依赖顺序实现：
```
FR-5 (breadcrumb 协议) → FR-4 (升级引擎) → FR-1 (brainstorm) → FR-2 (plan) → FR-3 (continue)
```
LLM 抽象层作为前置基础设施。

---

## 子任务清单

### 📦 S0: 前置基础设施 — LLM 抽象层

- [ ] **S0.1: 创建 LLM 抽象接口**
  - 文件: `src/llm/client.ts`
  - 内容: 定义 `LLMClient` 接口（`chat()` 方法），支持可配置 endpoint/model/apiKey
  - 依赖: 无
  - 预计: 30min
  - 验收: `LLMClient` 接口定义完整，支持流式和非流式

- [ ] **S0.2: 实现 OpenAI 兼容适配器**
  - 文件: `src/llm/openai-adapter.ts`
  - 内容: 实现基于 fetch 的 OpenAI 兼容 API 调用
  - 依赖: S0.1
  - 预计: 30min
  - 验收: 能向 OpenAI 兼容端点发送 chat 请求

- [ ] **S0.3: 配置读取与密钥管理**
  - 文件: `src/llm/config.ts`
  - 内容: 从 config.yaml 读取 LLM 配置，支持环境变量覆盖 API Key
  - 依赖: S0.1
  - 预计: 20min
  - 验收: 从 `.docpath/config.yaml` 读取 `llm.endpoint` 和 `llm.model`

---

### 🍞 S1: GSD 面包屑协议 (FR-5)

- [ ] **S1.1: breadcrumb 写入器**
  - 文件: `src/engine/breadcrumb.ts`
  - 内容: 实现 `writeBreadcrumb(taskId, step, status, context)` 函数
  - 格式: YAML frontmatter + Markdown body
  - 依赖: 无
  - 预计: 20min
  - 验收: 写入的 breadcrumb.md 可被机器解析 + 人类阅读

- [ ] **S1.2: breadcrumb 读取器**
  - 文件: `src/engine/breadcrumb.ts` (同一文件)
  - 内容: 实现 `readBreadcrumb()` → 返回当前进度对象
  - 依赖: S1.1
  - 预计: 15min
  - 验收: 能正确解析 breadcrumb.md 的 YAML frontmatter

---

### 🔥 S2: 动态中途升级引擎 (FR-4)

- [ ] **S2.1: 熔断信号定义**
  - 文件: `src/engine/escalation.ts`
  - 内容: 定义熔断信号类型 + 检测规则
  - 信号: `files_changed > 3`, `new_module_detected`, `design_decision_needed`
  - 依赖: 无
  - 预计: 15min
  - 验收: 信号类型和检测函数定义完整

- [ ] **S2.2: current.md 升级标记协议**
  - 文件: `src/engine/escalation.ts` (同一文件)
  - 内容: 在 `current.md` 中添加 `escalation` 字段，定义读写接口
  - 依赖: S2.1
  - 预计: 15min
  - 验收: CLI 能检测 escalation 标记并触发升级

---

### 🧠 S3: docpath:brainstorm 命令 (FR-1)

- [ ] **S3.1: 命令入口 + 参数解析**
  - 文件: `src/commands/brainstorm.ts`
  - 内容: CLI 参数处理（任务描述、标题）、调用 LLM 的 Socratic 循环
  - 依赖: S0.2, S0.3
  - 预计: 45min
  - 验收: `docpath:brainstorm "任务描述"` 启动交互式需求拷问

- [ ] **S3.2: spec.md 生成器**
  - 文件: `src/commands/brainstorm.ts` (同一文件)
  - 内容: LLM 一轮轮对话 → 最终输出标准 `spec.md`
  - 依赖: S3.1
  - 预计: 30min
  - 验收: 生成的 spec.md 符合 spec.template.md 格式

---

### 📋 S4: docpath:plan 命令 (FR-2)

- [ ] **S4.1: spec.md 解析器 + plan.md 生成**
  - 文件: `src/commands/plan.ts`
  - 内容: 读取 spec.md → 调用 LLM 拆解子任务 → 输出 plan.md
  - 依赖: S0.2, S3.2
  - 预计: 45min
  - 验收: `docpath:plan T-xxx` 输出标准 plan.md

---

### 🔄 S5: docpath:continue 命令 (FR-3)

- [ ] **S5.1: continue 命令实现**
  - 文件: `src/commands/continue.ts`
  - 内容: 读取 breadcrumb.md → 展示进度 → 输出下一步指令
  - 依赖: S1.2
  - 预计: 30min
  - 验收: 断线后运行 `docpath:continue` 恢复执行上下文

---

### 🧪 S6: 集成测试 + 注册到 CLI

- [ ] **S6.1: 所有新命令注册到 index.ts**
  - 文件: `src/index.ts`
  - 内容: 添加 brainstorm/plan/continue 命令路由
  - 依赖: S3, S4, S5
  - 预计: 10min

- [ ] **S6.2: 端到端集成测试**
  - 内容: 在 docpath 项目内完整走一遍 brainstorm → plan → execute → breadcrumb 闭环
  - 依赖: S6.1
  - 预计: 20min

---

## 验证计划

- [ ] 每个 S 子任务完成后运行 `pnpm build` 验证编译
- [ ] 每个命令测试 `--help` 输出
- [ ] S6.2 做端到端 dogfooding 验证

## 回滚方案

若 LLM 接口集成遇到问题，brainstorm/plan 命令可以 fallback 到模板填充模式（不调用 LLM，直接输出模板 + 占位符）。

---

*此文件由 DocPath plan 阶段生成。执行过程中每完成一项请标记 [✓]。*
