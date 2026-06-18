# T-20260601-registercommands - 拆分 registerCommands 降低函数复杂度警告

> backlog_id: R-076
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- `docpath review` 仅剩 `src/commands/register.ts` 中 `registerCommands` 函数过长警告。
- 该函数集中注册所有 CLI 命令，天然较长，但职责可以按命令域拆成多个注册 helper。
- 本任务做行为保持型拆分，目标是让 `registerCommands` 只保留顶层分发，所有原有命令、参数和 action 行为保持一致。

## 验收

- `docpath review` 不再报告 `registerCommands` 过长。
- CLI 命令注册行为保持不变，现有测试全部通过。
- `docpath check` 与 `docpath review` 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 按命令域拆分 `registerCommands` 中的 CLI 注册逻辑
  - 来源 backlog: R-076
- [ ] FR-2: 保持所有现有命令、选项、位置参数和 action 调用语义不变

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 变更范围限定在 `src/commands/register.ts` 及必要测试验证，不处理 `review.ts` TODO 提示

## 3. 范围界定

### 包含
- 拆分 CLI 注册函数
- 保留命令注册顺序和用户可见行为
- 运行全量测试与 DocPath 门禁

### 不包含
- 不改各命令实现模块
- 不改变 CLI 输出文案和参数含义
- 不处理 `review.ts` TODO 提示

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-076 与任务 T-20260601-registercommands 建立双向关联
- [ ] AC-3: `docpath review` 不再包含 `registerCommands` 过长警告
- [ ] AC-4: `npm test` 与 `docpath check` 通过

---

*此文件由 `docpath backlog promote` 生成。*
