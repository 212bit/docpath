# T-20261001-worktree-node-modules - worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）

> backlog_id: R-467
> backlog_source: docpath backlog capture

## 1. 背景与动机

worktree 隔离模型的一个真实副作用：`worktree create` 会把主仓库 `node_modules`
软链接进 worktree（见 `src/commands/worktree/create.ts` 5.1），因此 worktree 内的
依赖安装（如 `pnpm add -D vitest`）实际写穿到主仓库 `node_modules`。worktree 删除后
该副作用不体现在分支内容上，只体现在"合并成功"之后主干的 `test:ui` 突然
`ERR_MODULE_NOT_FOUND`。只看合并结论会漏掉此类跨边界副作用。

## 2. 需求清单

### 功能需求
- [ ] FR-1: worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）
  - 来源 backlog: R-467

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）

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
- 当前问题: worktree 隔离模型的一个真实副作用：`worktree create` 会把主仓库 `node_modules`
- 目标: worktree node_modules 共享软链接的依赖安装写穿副作用（合并后才暴露）
- 背景: 来自 backlog R-467
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

- [ ] AC-1: 明确 worktree 内 `node_modules` 共享软链接下的依赖安装语义（写穿主仓库 vs 隔离），并给出可执行结论
- [ ] AC-2: 在 worktree 删除/合并收口路径上给出可检测信号（doctor / finish / prune），使"合并后主干测试失败"可在合并前被预见或至少被明确定位
- [ ] AC-3: 文档化该副作用到 `docs/features/worktree-workflow.md`，避免后续 agent 再次踩坑
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-467 与任务 T-20261001-worktree-node-modules 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
