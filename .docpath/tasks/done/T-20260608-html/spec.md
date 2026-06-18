# T-20260608-html - 新增 HTML 页面展示数据和流程

> backlog_id: R-095
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

用户希望添加页面，用来展示 DocPath 当前数据、执行进度和流程时间线。项目当前是 CLI，没有前端应用，适合在 export 命令中新增 HTML 静态页面输出能力。

## 验收

docpath export 支持生成 HTML 页面；页面展示当前任务状态、进度统计、流程时间线、计划步骤、检查证据和关键文档摘要；支持 stdout 和 --output；保持现有 markdown 导出兼容；测试覆盖 HTML 输出。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增 HTML 页面展示数据和流程
  - 来源 backlog: R-095

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 新增 HTML 页面展示数据和流程

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-095 与任务 T-20260608-html 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
