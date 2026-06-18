## 1. 必问问题（阻塞 spec）

以下问题已根据用户“正式推进”作出推荐决策，可直接写入 spec 的 Decision Brief：

1. 是否允许改变 Agent 默认读取行为？
   - 决策：允许。默认从“文档都可读”改为“索引优先 + 当前任务优先”。
   - 依据：用户已确认正式推进该方向。

2. 是否保留历史归档正文？
   - 决策：保留，不删除。
   - 依据：目标是保留长期记忆，只降低默认 token 消耗。

3. 是否将规则路径收敛到 `.docpath/rules/*`？
   - 推荐决策：是，作为 preferred 真源；`.docpath/spec/*` 保留 legacy 兼容。
   - 依据：`rules.ts` 已有 preferred/legacy 回退逻辑，`next --agent` 已输出 `.docpath/rules/*`。

4. 是否把预算超限作为 check 阻塞项？
   - 推荐决策：MVP 先 warning，当前任务缺 spec/plan 和规则双真源冲突可 blocking；预算阈值稳定后再升级 blocking。

## 2. 可延后问题（不阻塞 MVP）

- 是否为 Dashboard 增加 Context Budget 页面。
- 是否把 `.docpath/workspace/decisions.md` 立即迁移为 ADR 多文件结构。
- 是否提供交互式选择索引项再展开正文。
- 是否支持更精确的模型 tokenizer。
- 是否自动修复旧 backlog 条目的 links.spec 健康问题。

## 3. 需要用户/业务确认的假设

已采用假设：
- 默认上下文预算阈值先按 15k token 设计。
- 历史归档默认不读正文，但显式参数可以读取。
- 本任务不删除任何历史文档。
- 本任务允许修改 Agent 行为、工作流健康检查和规则路径策略。

仍需在 spec 中显式记录：
- 这是重大变更，类型包括：架构/模块边界、工作流/Agent 行为、长期维护成本增加。
- 用户确认：用户已通过“正式推进”确认进入该方向。

## 4. 需要实验验证的问题

- 默认 context 收敛后，实际输出 token 是否低于 15k。
- reveal Level 2/3 在不读取归档正文时，是否仍足以恢复复杂任务。
- learn 低信号过滤是否会误伤有价值经验。
- docs-index 扫描 400+ Markdown 文件的耗时是否可接受。
- check 增加上下文预算门禁后，是否会产生过多误报。

建议 MVP 实验：
1. 为当前仓库生成新 docs-index，统计 default_read=true 的 token。
2. 对比改造前后 `docpath context` 输出 token。
3. 用一个历史 task_id 验证按需读取归档正文。
4. 用现有 pending lesson 验证高信号/低信号分类。
