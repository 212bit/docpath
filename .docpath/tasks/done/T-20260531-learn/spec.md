# T-20260531-learn - 强化 learn 的去重与来源策略

> backlog_id: R-024
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 `learn` 已支持 `--from-journal` 与 `--dry-run`，但去重仍主要依赖本轮提取结果的文本唯一性：

- 同一批候选规则在本轮内可去重，但无法稳定识别“与 `style.md` / `architecture.md` 中已落盘规则语义相同”的重复项。
- 来源信息目前只在最终渲染文本中追加说明，缺少更稳定的来源键与去重基准，导致重复运行 `learn` 时更容易因为描述细节变化产生重复规则。
- 设计文档 `docs/design/next-phase-tasks.md` §11.8 明确要求 `learn` 具备“相同 lesson 不重复追加”的稳定能力，且来源要可追溯、可审查。

因此本任务聚焦于：在不改变现有 `learn` 基本入口语义的前提下，补强 lesson 的来源建模、落盘前去重和回归测试，避免知识回流层随着多次归档逐步膨胀失真。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `learn` 在写入 `spec/style.md` 与 `spec/architecture.md` 前，需识别自动学习区中已存在的规则，避免重复追加语义相同 lesson。
- [ ] FR-2: 去重不能只依赖完整描述文本相等，需基于稳定键（至少覆盖 `type`、`key/keyword`、目标文档、来源标识）判断同一规则。
- [ ] FR-3: `learn --from-journal` 与默认候选模式都要复用同一套来源建模与去重逻辑，避免两个入口行为漂移。
- [ ] FR-4: `learn --dry-run` 需能反映“提取到多少条、去重后将写入多少条、哪些规则因重复被跳过”的核心预览信息。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不破坏现有自动学习区 marker 结构，保证已有文件可无迁移继续使用。
- [ ] NFR-3: 新增逻辑应保持输出可追溯，来源信息可被 review 和人工审查直接理解。

## 3. 范围界定

### 包含
- `learn` 命令的 lesson 来源规范化
- `style.md` / `architecture.md` 自动学习区的历史规则去重
- `dry-run` 预览输出增强
- 相应单元测试与回归验证

### 不包含
- 重写 `journal` lesson-candidates 生成格式
- 调整 `review` 对 style/architecture 的审查规则
- 引入外部存储或独立 lesson 索引数据库

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 历史去重基准 | 仅比对描述全文 / 解析稳定键 | 解析稳定键 | 描述会因 wording 漂移，稳定键更适合长期累积 |
| 3 | 来源信息承载 | 仅渲染尾注 / 同时保留结构化来源键 | 同时保留结构化来源键 | 便于 dry-run、去重与后续审查共用 |
| 4 | 兼容策略 | 覆盖旧自动学习区 / 兼容旧内容并增量升级 | 兼容增量升级 | 避免已有知识资产失效或需要人工迁移 |

## 5. 验收标准

- [ ] AC-1: 重复执行 `learn` 或输入重复 lesson 时，`style.md` / `architecture.md` 中不会新增重复规则。
- [ ] AC-2: `--from-journal` 与默认模式对同一 lesson 的去重结果一致，且来源字段可追溯到 task/source。
- [ ] AC-3: `--dry-run` 输出包含去重后的写入统计或重复跳过信息，便于执行前确认。
- [ ] AC-4: 相关测试覆盖“历史规则已存在”“同批重复 lesson”“from-journal + dry-run”场景，并通过全量回归。

---

*此文件由 `docpath backlog promote` 生成。*
