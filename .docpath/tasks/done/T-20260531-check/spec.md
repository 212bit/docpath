# T-20260531-check - 细化 check 失败后的恢复路由

> backlog_id: R-026
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档 `docs/design/next-phase-tasks.md` 在 `§3.3` / `§11.4` 明确提到：质量门禁失败后，应推荐 `docpath tdd` 或调试流程，而不是只给出笼统的下一步。  

当前 `next --agent` 对 `check_fail` 的处理比较粗：无论失败发生在什么上下文、是否已经处于 TDD 循环中，统一返回 `docpath debug reproduce`。这有两个问题：

- 仓库已经存在 `docpath tdd` 循环，但 `check_fail` 路由没有利用这个已有恢复协议；
- 对于“已经在 TDD check 阶段，只差回到循环继续”的场景，`debug reproduce` 不是最贴合的动作，会让协议层与 TDD 层脱节。

本任务聚焦在 `check_fail` 场景下细化路由：让 `next --agent` 能根据是否处于 TDD 循环，给出更贴合的恢复命令，同时保留非 TDD 场景下的 debug 路径。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `next --agent` 在 `check_fail` 场景下需识别当前是否存在活跃的 TDD 循环状态。
- [ ] FR-2: 若 TDD 循环处于 `check` 阶段，`check_fail` 的推荐命令应指向 `docpath tdd next` 或等价的 TDD 恢复动作，而不是一律走 debug。
- [ ] FR-3: 若不存在活跃 TDD 循环，则继续保留 `docpath debug reproduce` 作为默认恢复路径。
- [ ] FR-4: 输出的 `next_action`、`required_files` 与 `exit_criteria` 需与实际恢复路径一致，避免协议提示与命令语义打架。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不回归已有 blocked/debug 路由逻辑；仅细化 `check_fail` 分支。
- [ ] NFR-3: 不要求改写 `tdd` 命令自身状态机；优先复用现有 `workspace/tdd-state.json` 语义。

## 3. 范围界定

### 包含
- `next --agent` 的 `check_fail` 路由细化
- TDD 状态感知
- 对应测试与回归验证

### 不包含
- 重构 `tdd.ts` 状态机
- 改写 `debug` 命令本身的步骤协议
- 扩展 `review_fail` 或其他 gate 的恢复策略

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | check_fail 恢复优先级 | 一律 debug / 优先复用活跃 TDD，再回退 debug | 优先 TDD，再回退 debug | 先尊重已有循环协议，再保留通用调试兜底 |
| 3 | TDD 状态来源 | 重新推断 / 读取 `workspace/tdd-state.json` | 读取持久状态 | 现成、稳定、与 TDD 命令自身一致 |

## 5. 验收标准

- [ ] AC-1: `check_fail` 且 TDD `phase=check` 时，`next --agent` 推荐 `docpath tdd next`，并给出对应恢复语义。
- [ ] AC-2: `check_fail` 但无活跃 TDD 时，`next --agent` 仍推荐 `docpath debug reproduce`。
- [ ] AC-3: 现有 blocked/debug 路由与非 `check_fail` 路由不回归。
- [ ] AC-4: 相关测试覆盖 TDD/非 TDD 两类 `check_fail` 场景，并通过串行回归验证。

---

*此文件由 `docpath backlog promote` 生成。*
