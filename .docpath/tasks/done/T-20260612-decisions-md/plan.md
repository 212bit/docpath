## 执行计划

### S1: 实现按月轮转逻辑
- [x] S1: 实现按月轮转逻辑
- **描述**: 在 `src/utils/` 新增 `gcDecisions(docpathDir, retentionDays=30)` 函数:读取 decisions.md,按条目 timestamp 分组,超过 retentionDays 的归档到 `decisions-YYYY-MM.md`,保留最近的在原地。幂等(重复执行不重复归档)。
- **验收条件**: 单元测试覆盖(模拟 60 天跨度 → 2 个归档文件);gcDecisions 不破坏决策 yaml frontmatter 结构。
- **依赖**: 无

### S2: 集成到 journal 命令
- [x] S2: 集成到 journal 命令
- **描述**: `journal.ts` 归档结束后调用 `gcDecisions()`,自动触发轮转。加 `--skip-gc` flag 允许跳过(测试/调试用)。
- **验收条件**: journal 执行后 decisions.md ≤ 30 天;老条目在归档文件;journal 现有测试通过。
- **依赖**: S1

### S3: 更新文档与 CLI 帮助
- [x] S3: 更新文档与 CLI 帮助
- **描述**: 
  - `AGENTS.md` / `CLAUDE.md` 补充说明:decisions.md 自动老化 30 天,历史查询读 `decisions-YYYY-MM.md`
  - 可选:新增 `docpath gc-decisions` 显式命令(供手动触发或 cron)
- **验收条件**: 文档提及轮转策略;gc-decisions 命令在 --help 可见。
- **依赖**: S2

### S4: 验证门禁并归档
- [x] S4: 验证门禁并归档
- **描述**: 运行 typecheck、tests、check、review,确认无回归。journal 归档本任务。
- **验收条件**: 271+ 测试全绿;check/review 通过;decisions.md 当前 ≤ 30 天条目。
- **依赖**: S3

## 依赖关系图
S1 → S2 → S3 → S4

