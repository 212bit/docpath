## 1. 产品风险

- 风险：过度收敛默认上下文后，Agent 可能缺少必要背景。
  - 缓解：默认输出必须列出可展开索引项和建议命令，支持 topic/task_id 按需读取。
- 风险：用户误以为历史已被删除。
  - 缓解：文案明确“归档保留但默认不读正文”。
- 风险：规则高信号化标准过严，导致有价值经验未被沉淀。
  - 缓解：learn 输出分类，archive-only 不丢弃，只是不进入 rules。

## 2. 设计风险

- 风险：Level 0-3 的含义与旧文案冲突。旧 reveal 文案说 Level 3 是“全量文档 + 完整历史”。
  - 缓解：重定义 Level 3 为“更多索引和显式展开能力”，历史正文仍需显式参数。
- 风险：CLI 输出字段不稳定会影响 Agent 解析。
  - 缓解：新增字段只追加，不随意改名；required_files 继续保留。
- 风险：Dashboard 后续如果直接复用旧接口，仍可能拉取过多正文。
  - 缓解：Dashboard 默认读索引 API，正文读取走明确选择。

## 3. 技术风险

- 风险：docs-index schema 扩展后旧索引读取报错。
  - 缓解：读取方对缺失字段使用默认值，并加 version 兼容。
- 风险：token 估算粗略，不等于真实模型 token。
  - 缓解：作为预算近似和相对排序即可，不作为精确计费依据。
- 风险：rules preferred/legacy 双路径可能继续漂移。
  - 缓解：check/doctor 对双真源冲突 fail-loud，install/templates 明确 preferred 路径。
- 风险：context/reveal 为了按 topic 展开而临时扫描全量目录。
  - 缓解：默认读取索引；索引缺失时提示 scan，不自动扫描并注入。
- 风险：当前 task promoted spec 仍是种子草稿，未记录重大变更确认。
  - 缓解：正式 spec 必须填写 Decision Brief，勾选重大变更类型：架构/模块边界、工作流/Agent 行为、长期维护成本增加。

## 4. 交付风险

- 风险：本任务范围容易膨胀到“重做整个文档系统”。
  - 缓解：MVP 只做默认读取收敛、索引 schema、规则高信号和 check 门禁。
- 风险：已有 pending lessons 和 install-manifest-drift 干扰 check。
  - 缓解：在 plan 中安排前置处理或明确作为已知外部健康项。
- 风险：历史 backlog groom 已有旧条目 links.spec 问题，可能导致全量 groom 阻塞。
  - 缓解：本任务不以全量 backlog groom 通过作为 MVP 阻塞条件，除非修改 backlog 健康策略。

## 5. 缓解措施与触发条件

触发条件：
- 默认 context token 估算超过阈值。
- docs-index 缺失或更新时间落后于关键文档。
- `.docpath/rules/*` 与 `.docpath/spec/*` 同时存在且内容不一致。
- `tasks/current` 或 canonical 当前任务缺 spec/plan。
- learn 候选描述过短、只包含流程完成统计或没有可复用规则。

缓解措施：
- check 输出明确修复命令。
- context/reveal 输出被排除区域摘要。
- learn 提供 groom/prune 或 skip 分类。
- docs scan 可重建索引。
- 保留显式 include archive 作为回退路径。
