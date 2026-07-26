# T-20260726-git-dirty-guard-isdocpathworktree-symlin - git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补

> backlog_id: R-288
> backlog_source: docpath backlog add

## 1. 背景与动机

2026-07-26 架构 review 发现 git-dirty-guard.ts 两处缺陷：

1. isDocpathWorktree（src/utils/git-dirty-guard.ts:200-204）仍以「.docpath/backlog 与 .docpath/rules 是 symlink」识别 DocPath worktree——R-273 契约修正后二者是 tracked copy，该判定永远 false，worktree 内 execution-start 的放宽分支成为死逻辑。这是 R-271→R-273 契约翻转未全链清扫的残留，与 R-277（模板层漏改）同一模式。
2. assertNoNonDocPathChangesForExecutionStart 的 isActiveTask 判定（git-dirty-guard.ts:220）要求 state.phase === 'executing'；check/review 失败后回补代码时 phase 处于 checking/reviewing，本任务自己的 tracked 改动被重新拦截，只能 docpath run start 绕行（backlog 已归档条目「go --step 认领当前任务下一步被本任务自身脏文件拦截, 需 run start 绕行」实录）。

- worktree 判定改为与共享契约无关的机制：.git 为文件（worktree 的 gitdir 指针）或 git rev-parse --git-common-dir ≠ --git-dir；删除 symlink 判定。
- isActiveTask 的 phase 条件放宽为 executing | checking | reviewing（同一 task_id 前提不变）。
- 为 worktree doctor 增加对该判定的一致性校验/测试，防止下次共享契约调整再留死逻辑。

## 2. 需求清单

### 功能需求
- [ ] FR-1: git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
  - 来源 backlog: R-288

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

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
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 2026-07-26 架构 review 发现 git-dirty-guard.ts 两处缺陷：
- 目标: git-dirty-guard 修缮: isDocpathWorktree symlink 死逻辑 + isActiveTask 阶段条件误拦回补
- 背景: 来自 backlog R-288
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 在真实 git worktree 内（tracked-copy 契约下）isDocpathWorktree 判定为 true，execution-start 放宽分支有回归测试覆盖。
- [ ] AC-2: phase=checking/reviewing 时，本任务的 tracked 改动不再被 execution-start guard 拦截；与任务无关文件仍被拦截。
- [ ] AC-3: 现有 dirty-worktree-guard 测试全绿，新增上述两场景测试。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-288 与任务 T-20260726-git-dirty-guard-isdocpathworktree-symlin 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
