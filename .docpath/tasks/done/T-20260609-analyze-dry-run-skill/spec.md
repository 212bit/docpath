# T-20260609-analyze-dry-run-skill - 修正 analyze dry-run 语义与 Skill 前置分析指引

> backlog_id: R-150
> backlog_source: docpath backlog add

## 1. 背景与动机

# 背景
Codex 实测显示 `docpath analyze --dry-run` 只回显输入，不能作为开发前分析预览；正式 `analyze` 虽生成 prompt payload 并推进 predev-analysis，但没有足够强制 Agent 写入/读取 `analysis/*`。

# 目标
采用 B + 轻量 C：dry-run 输出完整分析预览载荷但不落盘；正式 analyze 增强上下文采集建议与写入指引；Skill 禁止 dry-run 当正式分析，要求写入并读取 analysis 后再回答。

# 验收
- dry-run 输出 predev-analysis payload、recommended_writes、output_format、context_collection，不改状态不生成 analysis 文件。
- 正式 analyze 输出必须写入 analysis/* 的指引并继续推进 drafting。
- Skill 模板包含 dry-run 警告和开发前分析闭环。
- typecheck、目标测试、全量测试通过。

## 2. 需求清单

### 功能需求
- [x] FR-1: `docpath analyze --dry-run` 输出完整 predev-analysis payload、recommended_writes、output_format、context_collection、required_follow_up，且不更新状态。
  - 来源 backlog: R-150
- [x] FR-2: 正式 `docpath analyze` 输出必须写入 `analysis/*` 的分区指引，并保留 drafting/predev-analysis 推进。
- [x] FR-3: Codex Skill 明确 dry-run 只用于预览，禁止当作正式开发前分析结果；正式分析需写入并读取 `analysis/*`。

### 非功能需求
- [x] NFR-1: 保持与现有 DocPath 工作流兼容。
- [x] NFR-2: 不引入新文件体系或自动分析引擎，降低行为变更半径。

## 3. 范围界定

### 包含
- `docpath analyze --dry-run` 输出完整 predev-analysis payload 且不改状态。
- 正式 `docpath analyze` 增加上下文采集、写入 analysis/* 和读取 follow-up 指引。
- Codex Skill 模板与已安装 Skill 增加 dry-run 禁止误用说明。
- 目标测试覆盖 dry-run payload。

### 不包含
- 不新增 research/decisions 文件结构。
- 不自动生成完整 `analysis/*` 内容。
- 不进入具体管理页面实现。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: Codex 实测中 `docpath analyze --dry-run` 只回显输入，Agent 容易把 dry-run 误当作正式开发前分析；正式 analyze 虽输出 prompt payload，但对写入/读取 `analysis/*` 的闭环约束不足。
- 目标: 修正 dry-run 语义为“完整分析载荷预览但不落盘/不改状态”，并强化正式 analyze 与 Codex Skill 的分区分析闭环。
- 背景: 用户明确要求采用 B + 轻量 C；先修语义和 Skill 指引，不新增 research/decisions，不自动生成完整 analysis 内容。
- 可选方案: A 保持现状；B dry-run 输出完整 payload；C 新增真实分析引擎；B + 轻量 C 强化正式分析闭环。
- 推荐方案: 采用 B + 轻量 C：dry-run 输出完整 payload；正式 analyze 增加 context_collection、recommended_writes、required_follow_up；Skill 禁止把 dry-run 当正式结果。
- 不做什么: 本任务不新增 research/decisions 文件，不让 CLI 自动生成完整 `analysis/*`，不进入具体管理页面实现。
- 成本: 需要更新 analyze 命令、Codex Skill 模板/已安装 Skill 和目标测试。
- 风险: Agent 仍需按 payload 自行分析，CLI 不是完整智能分析引擎；风险通过 Skill 明确“写入并读取 analysis/* 后再回答”缓解。
- 回滚方案: 回退 `src/commands/analyze.ts`、`templates/codex-skills/docpath/SKILL.md`、`.codex/skills/docpath/SKILL.md` 与 `tests/analyze.test.mjs` 的本次改动。
- 用户确认: 用户在长提示中确认推荐方向“B + 轻量C”，要求执行修正 dry-run 语义与 Skill 前置分析指引。

## 5. 验收标准

- [x] AC-1: `docpath analyze --content "..." --dry-run` 输出 JSON payload，包含 `dry_run: true`、`context_collection`、`recommended_writes`、`required_follow_up`、`output_format`，且不输出“状态已更新”。
- [x] AC-2: 正式 `docpath analyze` payload 包含写入 `analysis/*` 与读取 follow-up 的明确指引，并继续推进 drafting。
- [x] AC-3: `templates/codex-skills/docpath/SKILL.md` 与 `.codex/skills/docpath/SKILL.md` 明确禁止将 dry-run 当正式分析结果。
- [x] AC-4: `pnpm run build`、`pnpm run typecheck`、`node --test tests/analyze.test.mjs`、`docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
