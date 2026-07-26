# R-287 Analysis — spec/plan 单真源：desync 自愈取代告警（方案 A）

> 用户已确认方案 A（2026-07-26）：JSON 为结构化字段真源，MD 受管段落按真源重渲染，叙述段保留人写。
> 本文档把方案 A 落到现有机制上，并解决设计推演中发现的数据丢失隐患。

## 1. 现状机制（深读结论）

- 所有系统写路径已经是 md+json 原子双写：`writeActiveTaskFile`（task-files.ts:36-54）写 md 后立即 `writeStructuredTaskJson` 解析生成 json（canonical + current 各一份），json.source.content_sha256 记录 md 快照哈希。
- `markPlanStep`（plan-sync.ts:79）在 plan.lock 下对 md 做 marker 正则手术后走 `writeActiveTaskFile`——步骤状态的系统写已一致。
- 漂移检测点仅两处：review.ts:65 `assertNoActiveTaskStructuredMarkdownDrift`（**抛错阻塞**）与 agent-output/formatters.ts:447/1143（next/status 路由改写为「去手动 write-spec」）。
- 漂移唯一现实来源：(a) check.ts quick→standard 升级用 `writeFileSafe` 裸写 spec.md 不带 json（然后让 agent 手动 write-spec）；(b) 手改/外部工具改 md；(c) 双写中途崩溃（md 先写，json 后写 → md 领先）。**json 领先 md 的场景在现有流程中不存在。**

## 2. 设计推演中的关键发现（安全约束）

若自愈实现为「JSON 真源整段重渲染受管段落」：agent 手写进 md 的新条目（json 中不存在的 FR/AC/步骤）会被整段替换删除；canonical 任务文件默认 gitignore，未 force-add 前不在 git 里——**内容真丢失**。因此整段重渲染只允许用于 md 缺失/损坏的重建路径，不能用于常规自愈。

## 3. 方案 A 落地设计

### 3.1 真源划分（字段级）

- **状态字段**（spec 条目勾选态、plan 步骤状态 marker）：json 为真源——这些只应由系统命令（agent step / check / review）写入。
- **内容字段**（条目文本、新增条目、叙述段落）：md 为输入载体，解析吸收进 json（与现有 write-spec 方向一致）。
- 消费方（go/check/review 的门禁判定）继续只读 json——已成立，不变。

### 3.2 自愈原语 healStructuredMarkdownDrift(docpathDir, taskId, file)

1. `detectStructuredMarkdownHashDrift` 无漂移 → no-op。
2. json 缺失/损坏 → 直接 `writeActiveTaskFile(md)` 重建 json（吸收路径）。
3. 正常漂移：
   a. 对 md 按 json 真源做 **marker 强制**：已知 id 的 checklist 行勾选态回写为 json 状态（复用 markPlanStep 的行级正则模式；spec 的 FR/NFR/AC 同法）；
   b. md 中 json 没有的条目/文本一律保留；
   c. 结果经 `writeActiveTaskFile` 双写落盘 → 重解析吸收 md 侧内容进 json、sha 同步归零漂移；
   d. 返回 healed 报告（被强制回写的 marker 列表 + 被吸收的新增条目 id），调用方 loud 输出。
   零内容丢失（只动 marker 字符），故无需备份文件。

### 3.3 检测点改造（AC-2/AC-4）

- review.ts：漂移 → 调 heal，成功则打印 🩹 自愈报告并继续；仅 heal 自身 IO 失败才抛错。
- check：入口对 active task 的 spec.md/plan.md 各跑一次 heal（gate 命令允许写；先于各 validator 执行，使「任意 gate 自动收敛」成立）。
- check.ts quick→standard 升级：`writeFileSafe(spec.md)` 改 `writeActiveTaskFile`，删除「请运行 write-spec 同步」提示——源头不再制造漂移。
- formatters.ts（next/status）：**保持只读**，不在 advisory 路径写盘；仅改提示文案为「下一次 check/review 将自动收敛」，不再指挥 agent 手动 write-spec。

### 3.4 不做

- 不改 write-* 命令族入口与语义（薄封装合并留后续）；
- 不改 FSM 事件表；
- 不做 md 受管段落的注释标记迁移（现有标题即边界，避免全量模板/存量任务迁移）；
- 整段 json→md 重渲染仅保留于 md 缺失重建（renderStructuredMarkdown 现状）。

## 4. 验收标准（细化）

- AC-1: heal 幂等——同一状态连续 heal 两次，第二次报 no-drift；marker 强制后的 md 重解析回 json 与 json 真源状态一致。
- AC-2: review 在漂移下不再阻塞：自愈后继续并输出报告；check 入口收敛漂移；quick→standard 升级不再产生漂移也不再要求手动 write-spec。
- AC-3: 叙述段落与 md 侧新增条目在自愈后逐字保留，且新增条目被吸收进 json。
- AC-4: 崩溃窗口（md 已写 json 未写）在下一次 check/review 自动收敛，回归测试覆盖。
- AC-5: next/status 保持只读，漂移提示不再指挥手动 write-spec。

## 5. 风险与回滚

- 风险：marker 正则误匹配非 checklist 行——复用 markPlanStep 已验证的行级正则并加测试；heal 在 review/check 增加毫秒级 IO。
- 回滚：heal 调用点独立、可逐点 revert；整任务回滚后退回「检测即阻塞」现状。
