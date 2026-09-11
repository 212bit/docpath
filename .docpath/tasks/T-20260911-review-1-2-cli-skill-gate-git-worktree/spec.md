# T-20260911-review-1-2-cli-skill-gate-git-worktree - 工作流/Review/架构优化包 1+2：漂移自愈提示/恢复指引/CLI 旗标/skill gate 干净跳过/消息纠偏 + git 共享原语/收尾路径收敛/worktree 拆分

> backlog_id: R-337
> backlog_source: docpath backlog add

## 1. 背景与动机

三天 dogfooding 实测摩擦 + 结构审计：W1 spec 双真源漂移提示刷屏（next --agent 每次重复可自愈提示）；W2 plan 漂移锁恢复笨重（plan 预勾触发 drift_lock 拒 go，恢复要 write-plan 重写；agent step 在 planning 报非法转移无指路）；R1 review 缺 --non-interactive（check 有，实测 Unknown option）；R2 skill gate 盖章仪式（current_diff 0错0警仍要手工 write-review-skill 盖 boilerplate，实测 2 次）；R3 review 消息误导（❌ 需要修改 0错13警，真实阻塞是 skill gate，13 警全是 baseline 不阻塞）；A1 git 调用无共享原语（12+ 文件各自 execFileSync('git')，quotePath=false 仅 4 处，8+ 处带 CJK quoting bug 类）；A2 worktree.ts 1333 行巨石；W3 步骤收尾三条平行路径（go --status/agent step/run end 各写 breadcrumb+plan sync）。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 工作流/Review/架构优化包 1+2：漂移自愈提示/恢复指引/CLI 旗标/skill gate 干净跳过/消息纠偏 + git 共享原语/收尾路径收敛/worktree 拆分
  - 来源 backlog: R-337

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 工作流/Review/架构优化包 1+2：漂移自愈提示/恢复指引/CLI 旗标/skill gate 干净跳过/消息纠偏 + git 共享原语/收尾路径收敛/worktree 拆分

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
- 当前问题: 三天 dogfooding 实测摩擦 + 结构审计：W1 spec 双真源漂移提示刷屏（next --agent 每次重复可自愈提示）；W2 plan 漂移锁恢复笨重（plan 预勾触发 drift_lock 拒 go，恢复要 write-plan 重写；agent step 在 planning 报非法转移无指路）；R1 review 缺 --non-interactive（check 有，实测 Unknown option）；R2 skill gate 盖章仪式（current_diff 0错0警仍要手工 write-review-skill 盖 boilerplate，实测 2 次）；R3 review 消息误导（❌ 需要修改 0错13警，真实阻塞是 skill gate，13 警全是 baseline 不阻塞）；A1 git 调用无共享原语（12+ 文件各自 execFileSync('git')，quotePath=false 仅 4 处，8+ 处带 CJK quoting bug 类）；A2 worktree.ts 1333 行巨石；W3 步骤收尾三条平行路径（go --status/agent step/run end 各写 breadcrumb+plan sync）。
- 目标: 工作流/Review/架构优化包 1+2：漂移自愈提示/恢复指引/CLI 旗标/skill gate 干净跳过/消息纠偏 + git 共享原语/收尾路径收敛/worktree 拆分
- 背景: 来自 backlog R-337
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-09-11 用户经 AskUserQuestion 显式选择「包 1+2（推荐）」（R-337 工作流/Review/架构优化）

## 5. 验收标准

- [ ] AC-1: 包1：W1 漂移提示同 sha 去重不刷屏；W2 drift_lock 消息按漂移类型给直接修复命令，agent step planning 报错指路 go；R1 review 支持 --non-interactive；R2 current_diff 0错0警时 skill gate 自动 pass_with_skips（记录原因）；R3 review 消息区分 baseline 警告并点名真实阻塞原因。包2：A1 新建 utils/git-run.ts 共享原语（quotePath=false+timeout+capture），12 文件迁移；A2 worktree.ts 拆分为 commands/worktree/ 子目录（行为不变）；W3 go --status 与 agent step 收尾共用 runtime end 原语。全量测试绿。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-337 与任务 T-20260911-review-1-2-cli-skill-gate-git-worktree 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
