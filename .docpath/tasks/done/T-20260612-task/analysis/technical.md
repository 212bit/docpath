## 1. 架构影响与模块边界

受影响模块：
- `src/utils/agent-output.ts`：`next --agent` 的 required_files 和健康摘要，是默认读取策略入口。
- `src/commands/context.ts`：当前会组合 current/breadcrumb/spec/plan/last-check/rules/indexed docs，需要改成索引优先并控制归档读取。
- `src/commands/reveal.ts`：当前 Level 3 文案表示“全量文档 + journal + harness + 完整历史”，需要改成显式按需展开。
- `src/commands/docs.ts`：当前 docs scan 扫描 `.docpath` 下 md 文件，生成 docs.md/docs-index.json；需要扩展 schema，加入 default_read、archive、token_estimate、stale 判断。
- `src/utils/context-index.ts`：已有任务级 Hybrid Context Index，可复用/扩展为项目级索引设计参考。
- `src/utils/rules.ts` 与 `src/commands/learn.ts`：规则路径回退和经验沉淀策略需要高信号化。
- `src/commands/check.ts`：新增上下文预算、索引完整性、规则双真源、当前任务必备文件完整性检查。

边界原则：
- 状态真源仍是 `state.json`，本任务不改变 FSM 核心。
- 索引是导航元数据，不是正文真源。
- 历史归档继续存放在 `.docpath/tasks/done`，但默认读取策略排除正文。

## 2. 数据模型/API/事件契约

建议新增或扩展文档索引条目：

```ts
interface DocPathDocumentIndexEntry {
  path: string;
  kind: 'state' | 'task' | 'archive' | 'rule' | 'template' | 'design' | 'research' | 'command' | 'log' | 'index';
  scope: 'current-task' | 'project' | 'archive' | 'template' | 'runtime';
  default_read: boolean;
  level: 0 | 1 | 2 | 3;
  title: string;
  summary: string;
  token_estimate: number;
  updated_at: string;
  task_id?: string;
  topic_tags?: string[];
  stale?: boolean;
}
```

命令契约候选：
- `docpath context --topic <topic>`：读取匹配索引项摘要和必要正文片段。
- `docpath context --task-id <id>`：读取指定历史任务包。
- `docpath context --include-archive`：允许归档正文进入上下文。
- `docpath reveal --topic <topic>`：只展开匹配主题，默认不读归档正文。
- `docpath docs scan`：生成含 token_estimate/default_read 的索引。
- `docpath check`：报告 context-budget / docs-index / rules-source / task-files-completeness。

## 3. 依赖、迁移与兼容性

依赖：
- 不需要新增第三方依赖；当前 Node fs/path 和已有 YAML/JSON 足够。
- token 估算可复用 `context.ts` / `reveal.ts` 中现有粗略估算函数，后续再统一。

迁移：
- `.docpath/spec/style.md` 和 `.docpath/spec/architecture.md` 继续作为 legacy 读取源。
- 新 preferred 路径为 `.docpath/rules/style.md`、`.docpath/rules/architecture.md`。
- `rules.ts` 已具备 preferred/legacy 回退逻辑，本任务可先强化 check/doctor 诊断，再决定是否自动迁移。
- `docs-index.json` schema 扩展应兼容旧字段；读取方对缺失字段提供默认值。

兼容性风险：
- 旧测试可能断言 Level 3 包含完整历史，需要调整为“Level 3 提供更多索引和显式展开能力”。
- 用户可能依赖 `context` 输出完整 style 文件；需保留 `--full-rules` 或通过 token 预算截断策略替代。

## 4. 测试策略与质量门禁

单元/集成测试建议：
- docs scan 生成 token_estimate/default_read/archive 标记。
- context 默认不包含 `.docpath/tasks/done` 正文。
- reveal Level 3 不自动输出完整 archive，除非 `--include-archive` 或 task_id。
- next --agent required_files 只包含当前任务必需文件和索引，不包含历史正文。
- learn 对低信号 lesson 分类为 archive-only/skip，不写入 rules。
- check 能在当前任务缺 plan/spec、rules preferred/legacy 双真源、docs-index 陈旧、默认 context 超预算时失败或警告。

质量门禁：
- `pnpm run typecheck`
- `pnpm test` 或聚焦测试后再全量测试
- `docpath check`，必要时新增 `--skip-tests` 时必须记录理由

## 5. 安全、性能与运维风险

安全：
- `--topic`、`--task-id`、`--path` 类参数不得允许读取 `.docpath` 外部任意路径。
- 索引里保存的是路径和摘要，不应包含敏感正文复制。

性能：
- docs scan 会读取所有 md 文件，属于显式维护命令，可以较重；context/reveal 默认不应临时扫描全量目录。
- 默认 context 输出应优先裁剪规则大文件和历史归档，而不是截断 current/spec/plan。

运维：
- 索引陈旧应可诊断且可重建。
- 新 schema 要有版本字段，未来可迁移。

实现切片建议：
1. 定义项目级 docs-index schema 与 token/default_read 计算。
2. 改 context/reveal 默认读取策略，归档必须显式展开。
3. 改 learn/rules 高信号规则策略和路径诊断。
4. 增加 check 门禁和测试覆盖。
