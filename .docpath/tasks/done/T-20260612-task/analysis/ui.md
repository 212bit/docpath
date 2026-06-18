## 1. 信息架构与页面清单

本任务不新增产品视觉页面的 MVP，但会改变 DocPath CLI/Dashboard 的信息架构。核心 IA 应从“目录树式文档集合”转为“索引入口 + 当前任务包 + 按需展开”。

CLI 信息区：
- `next --agent`：显示下一步、required_files、must_update、预算/索引健康摘要。
- `context`：默认输出当前任务包和高信号规则摘要；可选 topic/task_id/archive 参数展开。
- `reveal`：保留 level 0-3，但 Level 3 也不应无条件读完整历史；Level 3 应表示“更丰富索引 + 按需片段”，不是“全量文档”。
- `docs scan/list`：展示文档索引、默认读取级别、token 估算、是否归档。
- `learn groom/prune`：展示候选经验的高信号/低信号分类。

Dashboard 后续可映射的页面区域：
- Context Budget：默认上下文 token、排除区域、最大文件。
- Document Index：按 kind/scope/default_read/topic 过滤。
- Rules Health：rules/spec 双真源、低信号规则、未固化 lesson。
- Archive Explorer：只在显式选择 task_id 后展示归档正文。

## 2. 关键流程/线框描述

流程 A：默认上下文恢复
- 顶部/开头：当前任务、phase/gate、recommended_command。
- 中部：required_files 列表和每个文件摘要。
- 底部：被排除的高成本区域摘要，例如 `tasks/done: 194 files excluded`。
- 文案必须明确“未读取归档正文；需要时使用 --task-id 或 --include-archive”。

流程 B：按主题展开
- 用户提供 topic，例如 `rules`、`dashboard`、`ui-gate`。
- 命令输出匹配的索引项，先给摘要和路径。
- 只有用户选择或参数明确时，才输出正文片段。

流程 C：规则沉淀
- 显示候选 lesson。
- 每条标注分类：rule-worthy、archive-only、duplicate、too-vague。
- 只有 rule-worthy 写入 `.docpath/rules/*`。

## 3. 组件、状态、表单与校验

CLI 输出状态：
- 正常：预算内，索引有效，当前任务包完整。
- 警告：预算接近阈值、索引陈旧、legacy rules 回退、lesson 未固化。
- 阻塞：当前任务缺 spec/plan、规则双真源冲突、默认 context 超预算且没有可裁剪项、索引损坏。
- 空态：无 docs-index 时提示运行 `docpath docs scan`，但不能自动扫描全量并注入上下文。

参数校验：
- `--topic` 为空时走默认 L0/L1。
- `--task-id` 必须匹配已知 task id。
- `--include-archive` 必须显式，不能由 level 自动推断。
- `--max-tokens` 超小值时输出索引摘要而不是截断关键状态。

## 4. 空态/错误/加载/权限态

空态：
- 无索引：输出当前任务包 + “索引缺失”诊断，不读取全量目录兜底。
- 无当前 plan：输出 spec 摘要并提示 plan 缺失。
- 无 rules：输出 legacy 回退或提示初始化 rules。

错误态：
- 索引 JSON 损坏：fail-loud，提示重建索引。
- task_id 不存在：列出相近 task id 或提示 `docs list`/task index。
- 默认预算超限：列出最大贡献区域和建议命令。

加载态：CLI 不需要长 loading UI；Dashboard 可在后续实现中对 docs scan / context budget 计算展示 loading skeleton。

权限态：本任务主要是本地文件读取策略，无角色权限系统；但必须防止 path/topic 参数突破 `.docpath` 工作区边界。

## 5. 响应式、可访问性与文案

CLI 文案原则：
- 明确区分“索引摘要”和“正文已读取”。
- 明确列出“默认排除区域”，减少 Agent 误以为已掌握全部历史。
- 输出字段稳定，便于 Agent 解析。

Dashboard 后续响应式原则：
- Context Budget 和 Document Index 适合表格/列表，不做营销式卡片堆叠。
- 小屏优先展示任务状态、预算、风险，索引明细可折叠。
- 状态色应克制：pass/warn/fail 三类即可。

可访问性：
- CLI YAML 字段要纯文本、稳定键名。
- Dashboard 后续筛选控件应有 label，预算风险不要只靠颜色表达。
