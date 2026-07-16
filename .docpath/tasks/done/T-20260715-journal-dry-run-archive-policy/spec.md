# T-20260715-journal-dry-run-archive-policy - journal --dry-run 归档预览文字与默认 archive policy 不符

> backlog_id: R-261
> backlog_source: docpath brainstorm

## 1. 背景与动机

[来源: 2026-07-13 docpath 项目现场，R-266 收尾] `docpath journal --dry-run`
预览输出与默认归档 policy 不符，导致 agent 需查源码才能确认 dry-run 实会做什么。

### 现场实测
- 命令: `docpath journal --dry-run`
- 输出含:
  ```
  🔍  [dry-run] 将归档: .docpath/tasks/T-20260713-hooks-...
            → .docpath/tasks/done/T-20260713-hooks-...
  🔍  [dry-run] 不写入状态、breadcrumb 或决策日志
  ```
- 但实际默认 `--optional-archive=skip` —— journal 调用时不传
  `--optional-archive=always` 则**不物理归档**（与 R-265 / CLAUDE.md
  "journal 默认不归档、gc --force 拥有归档" 一致，见 [[docpath-journal-archiving-semantics]]）。
- 即: dry-run 的"将归档"展示的是 **if-archive 归去哪**，而非 **默认会归档**。
  正式跑同名不带 flag 时归档延后，二者文字不自洽。

- `src/commands/journal.ts:397` 提示: `如需 journal 同次归档（老行为），使用 --optional-archive=always。`
  说明默认是 skip，但该提示在 dry-run 输出末尾，与正前文"将归档"措辞并置，易误读。
- dry-run 预览分支可能不分 archive policy mode，统一显示了归档路径。

小修、纯 UX；优先级 P3。核心价值是减少 agent 跨命令心智负担 ——
与 R-260 的 FR-5/FR-6（changes task-aware 分组）同属"减少 agent 跨命令
靠经验/读源码"的体验债。

## 1.1 已有证据

### 需求澄清历史 (brainstorm)

2026-07-13 R-266 收尾复盘发现


## 2. 需求清单

### 功能需求
- [ ] FR-1: journal --dry-run 归档预览文字与默认 archive policy 不符
  - 来源 backlog: R-261

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- journal --dry-run 归档预览文字与默认 archive policy 不符

### 不包含
- 待在后续规划中补充

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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: ## 背景
- 目标: journal --dry-run 归档预览文字与默认 archive policy 不符
- 背景: 来自 backlog R-261
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: `journal --dry-run` 输出显式标注当前 archive policy（默认 skip），
- [ ] AC-2: 例如: `archive policy: skip（默认，不实际归档；canonical evidence 保留）`。
- [ ] AC-3: 仅当显式传 `--optional-archive=always` 时，dry-run 输出"将归档: ... → ..."
- [ ] AC-4: 才表述"实际将发生"的归档动作。
- [ ] AC-5: 回归: 默认 dry-run 文字不再让 agent 误以为"跑 journal 就会物理归档"，
- [ ] AC-6: 避免为确认行为而读源码。
- [ ] AC-7: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-8: backlog 条目 R-261 与任务 T-20260715-journal-dry-run-archive-policy 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
