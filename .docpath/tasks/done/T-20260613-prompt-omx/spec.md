# T-20260613-optimize-workflow - 优化 DocPath 工作流效率，减少 token 浪费

## 1. 背景与动机

从任务 T-20260613-prompt-omx 的执行中发现，token 消耗达到 91k，远超预期的 40-50k。分析发现 4 个主要浪费源：

1. **plan 格式不匹配**：`docpath plan` 生成的格式缺少 checklist section，导致 check 失败后反复修改（~20k tokens）
2. **breadcrumb 重复记录**：同一步骤被多次记录，导致漂移检测误报（~10k tokens）
3. **check 输出冗长**：失败时输出所有检查项，不够聚焦（~8k tokens）
4. **缺少快速修复建议**：Agent 需要多次尝试才能找到正确修复方法（~5k tokens）

**目标**：实现 4 个优化点，将类似任务的 token 消耗从 91k 降低到 40-50k。

## 2. 需求清单

### 功能需求

- [ ] FR-1: 修复 plan 生成格式 — `docpath plan` 生成的 plan.md 自动包含 `## Checklist` section，每个步骤 ID 对应一个 `- [ ] Sx` 条目，格式符合 `doc-parser.ts` 的校验规则
- [ ] FR-2: breadcrumb 自动去重 — `docpath agent step` 在添加步骤前，归一化步骤名（`S1: xxx` → `S1`），检查是否已有相同步骤的 `done` 记录，如有则输出警告并跳过
- [ ] FR-3: check 输出分级 — `docpath check` 默认只显示失败项和警告项，通过 `--verbose` 显示所有检查项（包括成功项）
- [ ] FR-4: 快速修复建议 — `agent-output.ts` 在检测到常见错误时（plan 缺少 checklist、breadcrumb 漂移、plan/canonical 不同步），输出 `quick_fix` 字段，包含可执行的修复命令

### 非功能需求

- NFR-1: 不影响现有工作流的正确性
- NFR-2: 向后兼容现有的 plan.md 格式（已有 checklist 的不重复生成）
- NFR-3: 快速修复建议是可选的，不强制执行
- NFR-4: breadcrumb 去重只针对 `done` 状态，`in_progress` 和 `blocked` 仍可重复记录

## 3. 范围界定

**包含**：
- 修改 `src/commands/plan.ts` 生成逻辑，追加 checklist section
- 修改 `src/engine/breadcrumb.ts` 添加去重逻辑
- 修改 `src/commands/check.ts` 添加 `--verbose` 选项
- 修改 `src/utils/agent-output.ts` 添加 `quick_fix` 字段

**不包含**：
- 修改 plan.md 的核心格式（保持 `### Sx:` 结构）
- 自动执行快速修复（只提供建议）
- 修改 breadcrumb 的核心数据结构

## 4. 关键决策

- D-1: **checklist 生成策略** — 在 `docpath plan` 生成时追加 `## Checklist` section，而不是修改每个步骤的格式，保持向后兼容
- D-2: **步骤名归一化规则** — `S1: 创建xxx` → `S1`，`S1` → `S1`，忽略冒号后的描述
- D-3: **check 输出默认模式** — 只显示失败和警告，成功项用 `✅ N 项通过` 汇总
- D-4: **quick_fix 触发条件** — 只针对高频错误（plan 格式、breadcrumb 漂移、文件同步），不覆盖所有错误

## 5. 验收标准

- [ ] AC-1: 运行 `docpath plan` 后，生成的 plan.md 包含 `## Checklist` section，格式为 `- [ ] S1` `- [ ] S2` 等，`docpath check` 的 checklist 校验通过
- [ ] AC-2: 运行 `docpath agent step --step S1 --status done` 两次，第二次输出警告"步骤 S1 已完成，跳过"，不会在 breadcrumb.md 中重复记录
- [ ] AC-3: 运行 `docpath check` 失败时，只显示失败项（如 `❌ 2 项失败`），运行 `docpath check --verbose` 显示所有 11 项检查
- [ ] AC-4: 当检测到 plan 缺少 checklist 时，`docpath status --agent` 输出包含 `quick_fix: "docpath plan sync --add-checklist"` 字段
