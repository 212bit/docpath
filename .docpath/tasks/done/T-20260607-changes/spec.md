# T-20260607-changes - 新增 changes 变更收口命令

> backlog_id: R-094
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

DocPath 已经具备 check/review/journal、backlog 维护和 git hooks 安装能力，但缺少一个提交前的只读变更收口视图。用户和 agent 需要快速了解当前任务改了哪些文件、验证证据是否满足提交条件、是否存在未跟踪文件或 DocPath 运行态变更，并获得建议 commit message。该命令不应包装 git commit，也不应执行 git add/commit/push。

## 验收

新增 docpath changes 命令；在 git 仓库中汇总 dirty files 并按源码、测试、DocPath、模板/文档、其他分组；读取当前 task/backlog/check/review 状态并判断 ready_to_commit；生成建议 commit message；支持 --agent YAML 输出；非 git 仓库 fail-loud；不执行任何写入型 git 操作；测试覆盖非 git、dirty/untracked、check/review 状态和 agent 输出。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增 changes 变更收口命令
  - 来源 backlog: R-094

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 新增 changes 变更收口命令

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-094 与任务 T-20260607-changes 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
