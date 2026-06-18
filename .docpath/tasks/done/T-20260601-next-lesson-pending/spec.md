# T-20260601-next-lesson-pending - next 仅提示未吸收 lesson 候选

> backlog_id: R-048
> backlog_source: docpath backlog add

## 1. 背景与动机

- R-047 已让 `next --agent` 在存在 lesson 候选时推荐 `docpath learn`。
- 但执行 `docpath learn` 后，`lesson-candidates.md` 仍保留历史候选；如果 next 只检测候选文件存在，会持续推荐 learn，形成路由阻塞。
- 需要让 next 判断候选是否“尚未吸收”，仅当候选 key 不在 style/architecture 自动学习元数据中时才提示 learn。

## 2. 需求清单

### 功能需求
- [ ] FR-1: next 的 lesson 检测应读取 `lesson-candidates.md` 中的候选 key，并与 `.docpath/spec/style.md`、`.docpath/spec/architecture.md` 中的 `docpath:lesson-meta` 对比。
- [ ] FR-2: 当候选全部已吸收或会被 learn 去重跳过时，next 不再推荐 `docpath learn`。
- [ ] FR-3: 当存在至少一个未吸收候选时，仍推荐 `docpath learn`。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 检测逻辑应与 learn 的 lesson key 规范保持一致。

## 3. 范围界定

### 包含
- 增强 next lesson 候选检测。
- 增加回归测试覆盖已吸收和未吸收场景。

### 不包含
- 不清理 lesson-candidates 文件。
- 不改变 learn 的写入与去重逻辑。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 已吸收判断 | 文件清空 / meta key 对比 | meta key 对比 | 保留候选历史，同时避免重复提示 |

## 5. 验收标准

- [ ] AC-1: lesson 候选 key 已存在于 style meta 时，next 不推荐 `docpath learn`。
- [ ] AC-2: 存在新 lesson 候选 key 时，next 推荐 `docpath learn`。
- [ ] AC-3: 新增测试通过，`docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
