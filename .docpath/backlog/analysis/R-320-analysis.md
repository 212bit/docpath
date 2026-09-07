# R-320 分析：next --agent 状态哈希去重（前提证伪，关闭）

- 日期：2026-09-07
- 结论：**前提证伪，非缺陷，不立项**。判定依据为 FR-4 式实测取证（trace 全量数据 + 双环境输出采样）。
- 关联：R-317/S2（next 瘦身已落地）、R-318/R-319（同期 P0 取证教训）

## 1. 原主张

R-320 主张 `next --agent` 的"确认次数"成本未压住：按 \(C(N)=N\cdot B+\delta\cdot N^2/2\)，每次无变化的 `next` 仍付 \(B\)≈15–25k 的"全量历史重注入"，因此加状态哈希去重（无变化返回单行 `status_unchanged`）可砍掉零信息增量 turn。

## 2. 证伪证据

### 2.1 成本模型把 \(B\) 记错了账

\(B\)（15–25k）是 agent 每个普通 turn 都要付的上下文成本，**与是否运行 `next` 无关，去重救不了它**。一个冗余 `next` 真正独有的、可被去重消除的开销只有其 tool result 字节本身：

- 主仓全量快照（completed 态，R-317/S2 瘦身后）：**2583 字节**
- e2e fixture（drafting 态）：1698 字节

即单次冗余 `next` 的可省上限 ≈ 0.7–1k token，而非 15–25k。

### 2.2 实际冗余量远小于表面数字

对 `workspace/trace.jsonl` 全史（1543 条命令）分析：

- next+status 合计 217 次（与 R-320 原文"215 次/14.3%"一致）；
- 连续同命令对 167 个；
- 但**中间无任何状态变更命令（go/check/step/plan 等）的只有 39 对**，其余 128 对之间都有合法变更——变更后重新路由是设计行为；
- 且 39 对中还包含会话启动/恢复时的确认——那是 AGENTS.md 明确要求的行为（"Do not skip `docpath next --agent` at start/resume"）。

全史真实可省上限 ≈ 39 × ~1k ≈ **40k token**，摊到数周工作，边际收益很小。

### 2.3 prompt caching 进一步压塌收益

Claude Code / Codex 均有 prompt caching：历史前缀按缓存读计价（约 1/10），二次项 \(\delta N^2/2\) 基本被平台中和。去重方案瞄准的"重复快照内容"在后续 turn 中本就走缓存读。

### 2.4 技术可行但代价不成比例

- 输出字节稳定性：两次 `next` 输出仅差 `generated_at` 时间戳，路由字段完全稳定——哈希去重**可实现**（哈希覆盖路由字段、排除时间戳）。
- 但：
  1. `next` 被文档定位为**只读咨询路由**；哈希持久化使其成为写命令，且哈希为 workspace 级共享——多会话下 agent B 会在从未见过全量快照时收到 `status_unchanged`，破坏恢复安全；改按会话存储则机制翻倍。
  2. 从 compaction 恢复的 agent 需要全量快照；被抑制后被迫加 `--refresh`，安全意识强的 agent 会恒带 `--refresh` → 节省归零。
  3. R-320 自身验收项已承认"不要把'没变化'误读成'命令失败'"——契约层面自认有坑。

## 3. 判定

三条 P0（R-318/R-319/R-320）连错的共同根因：**把平台已消化、或任何 turn 都要付的成本记到了 DocPath 头上**。R-320 的可省上限配不上其实现复杂度 + 多会话正确性风险 + 契约风险。关闭。

若未来引入"多会话并发观测"或 prompt caching 不可用的宿主环境，可重新评估（P3 级）。

## 4. 顺带发现（非缺陷，不立项）

e2e-test fixture 首次 `next` 时 `state.json` 被一次性重写（旧 schema 读时归一化，2026-05 遗留 fixture），渲染 `state` 随之翻转 spec_written→drafting 后稳定。属 fixture 漂移 + 读时归一化的正常行为，正常仓库不触发。

## 5. 取证命令记录

```bash
# trace 冗余分析：next/status 连续对中无状态变更命令间隔的对数
node -e "... 过滤 trace.jsonl cmd 流，MUTATING 集合划界 ..."   # 39 redundant / 128 mutation-separated
# 输出尺寸与字节稳定性
docpath next --agent > /tmp/next1.txt; docpath next --agent > /tmp/next2.txt
wc -c /tmp/next1.txt   # 2583（主仓） / 1698（e2e fixture）
diff /tmp/next1.txt /tmp/next2.txt   # 仅 generated_at 一行差异
```
