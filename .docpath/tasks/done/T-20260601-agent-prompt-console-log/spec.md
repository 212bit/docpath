# T-20260601-agent-prompt-console-log - 移除 agent-prompt 生产 console.log 警告

> backlog_id: R-068
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `src/utils/agent-prompt.ts` 的 `emitPrompt` 使用多处 `console.log` 逐行输出 YAML prompt。
- 这些输出属于 CLI 正常 stdout 行为，但当前 `docpath review` 会将生产代码中的 `console.log` 统一标记为警告。
- 本任务目标是在不改变 prompt 输出内容和调用方行为的前提下，消除该文件内的生产 `console.log` 警告。

## 验收

- `src/utils/agent-prompt.ts` 不再直接调用 `console.log`。
- `emitPrompt` 默认仍向 stdout 输出与原来等价的 prompt 文本。
- `docpath review` 中该文件的 `console.log` 警告消失。
- `npm test` 与 `docpath check` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 移除 agent-prompt 生产 console.log 警告
  - 来源 backlog: R-068

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 移除 agent-prompt 生产 console.log 警告

### 不包含
- 不修改其它命令文件中的正常 CLI 输出。
- 不调整 review 规则的全局检测逻辑。
- 不改变 prompt 的 YAML 字段、缩进和截断策略。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-068 与任务 T-20260601-agent-prompt-console-log 建立双向关联
- [ ] AC-3: `src/utils/agent-prompt.ts` 中不再出现 `console.log`
- [ ] AC-4: `emitPrompt` 默认输出行为保持兼容
- [ ] AC-5: `npm test`、`docpath check`、`docpath review` 均完成，且 review 警告数下降

---

*此文件由 `docpath backlog promote` 生成。*
