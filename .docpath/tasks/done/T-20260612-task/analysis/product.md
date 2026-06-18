## 1. 用户价值与成功指标

用户价值：
- Agent 能以更少 token 恢复当前任务，减少读取历史噪声导致的误判。
- 人类仍能保留完整历史证据，但默认工作流只暴露当前任务和索引摘要。
- 项目长期规则更高信号，减少“完成 N/N 步”这类流水经验污染规则文件。

成功指标候选：
- 默认 `docpath context` token 估算低于 15k，且不包含 `.docpath/tasks/done` 正文。
- `docpath reveal --level 2` 输出索引摘要而非完整历史正文。
- `docpath check` 能检测规则路径双真源、索引陈旧、默认上下文超预算、当前任务必备文件缺失。
- `learn` 对低信号 lesson 候选给出 skip/groom 结果，而不是写入长期 rules。
- 历史任务仍可通过 task_id/topic 找到并读取。

## 2. 核心用户旅程

旅程 A：新会话恢复当前任务
1. Agent 运行 `docpath status --agent` 和 `docpath next --agent`。
2. 输出仅列出必要 `required_files`，优先 current/spec/plan/check/review/context-index。
3. Agent 不扫描 `.docpath/tasks/done`、`templates`、完整 docs 或大型 decisions 日志。
4. 如需更多背景，Agent 运行 `docpath reveal --topic <topic>` 或 `docpath context --topic <topic>`。

旅程 B：历史追溯
1. 用户或 Agent 根据索引定位历史 task/ADR/backlog 条目。
2. 显式传入 task_id/topic 才读取对应归档正文。
3. 输出标注来源路径、token 估算和是否为历史内容。

旅程 C：任务完成后知识沉淀
1. `journal` 生成候选经验。
2. `learn` 将候选分为 high-signal rules、archive-only lessons、duplicates。
3. 只有高信号项进入 `.docpath/rules/*`，其余保留在 journal/lesson-candidates 或被 groom。

## 3. 业务规则与运营约束

- 默认读面必须可预测：没有显式参数时，只读当前任务和索引，不读归档正文。
- 归档不是垃圾：历史任务正文仍保留，但归档目录对默认上下文不可见。
- 规则不是日志：rules 文件必须服务未来决策，不能记录普通流程完成情况。
- 索引是导航入口，不是另一个重复真源：索引保存摘要、路径、分类和预算，不复制完整正文。
- check 是守门人：上下文预算、索引陈旧、规则路径漂移属于工作流健康问题，应被 check 或 doctor 发现。

## 4. 竞品/替代方案与取舍

方案 A：继续依靠 Agent 自觉少读文档。
- 优点：无需改代码。
- 缺点：不可验证，容易因新会话或新 Agent 恢复时重复全量读取。
- 结论：不推荐。

方案 B：删除历史文档减少体量。
- 优点：立即降低文件数量。
- 缺点：破坏 DocPath 的长期记忆价值，且不能解决未来增长问题。
- 结论：不推荐作为主方案，只可作为后续 GC/归档策略。

方案 C：建立索引优先和按需展开机制。
- 优点：保留历史，降低默认上下文，行为可测试。
- 缺点：需要 schema、命令行为和 check 门禁协同改造。
- 结论：推荐。

方案 D：引入外部数据库保存文档索引。
- 优点：查询能力强。
- 缺点：超出当前本地文件协议定位，增加部署成本。
- 结论：不纳入 MVP。

## 5. 发布策略与灰度/回滚

发布策略：
- 第一阶段只改变默认 context/reveal/next 输出，不删除任何历史文件。
- 新增预算和索引诊断先以 warning 形式出现，确认稳定后再作为 blocking check。
- rules 路径迁移保留 legacy 回退，避免已有项目立即失效。

回滚策略：
- 保留旧 `.docpath/spec/*` 读取兼容。
- 新索引文件可以重建，不作为唯一内容真源。
- `context` / `reveal` 可保留显式 `--include-archive` 或 `--full` 模式，必要时恢复旧行为。

产品判断：
- MVP 应聚焦“默认少读”和“可按需读”，不要试图一次性做完整文档知识库。
