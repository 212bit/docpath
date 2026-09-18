# T-20260913-backlog-quick-done-active-promote-quick - backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）

> backlog_id: R-346
> backlog_source: docpath backlog capture

## 1. 背景与动机

backlog 状态矩阵（engine/backlog.ts BACKLOG_TRANSITIONS）主干 proposed→accepted→planned→active→done，其中 →active 唯一代码路径是 promote（src/commands/backlog.ts:1100）。但 AGENTS.md 强制 <50 行修复走 docpath quick（绕过 promote）。两条规则交叉产生的缝隙：quick 闭环的 backlog 条目无法合法销账——accepted→done 被拒（实测 R-333：Illegal transition，允许列表无 done），只剩 drop（语义失实：被拒项 ≠ 已完成项）。

1) backlog 条目 accepted；2) 对应修复经 docpath quick 完成并提交；3) docpath backlog done <id> → 报错，且无其它合法动作可达 done。

## 1.1 已有证据

### 深度分析摘要 (analysis)

机制定位：journal.ts:469 在 done 时只自动推进『已链接』条目（links.task 由 promote 写入），quick 绕开 promote 故无 link——这是缝隙的成因，也指明解法。方案：矩阵为 proposed/accepted/planned 开 done 捷径边（journal 直调 transitionBacklog 的路径不受影响）；校验统一收敛在 engine setBacklogStatus（新增 linkTask 选项：done 一律要求 links.task 非空；提供 --task 时验证 tasks/<id>/或 tasks/done/<id>/ 存在 breadcrumb/spec/plan 之一，已链接值冲突 fail-loud）。命令层仅透传，task.ts 只走 dropped 不受波及。现有测试 backlog.test.mjs:62 锁 proposed→done 拒绝，须同步更新。


## 2. 需求清单

### 功能需求
- [ ] FR-1: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
  - 来源 backlog: R-346

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）

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
- 当前问题: backlog 状态矩阵（engine/backlog.ts BACKLOG_TRANSITIONS）主干 proposed→accepted→planned→active→done，其中 →active 唯一代码路径是 promote（src/commands/backlog.ts:1100）。但 AGENTS.md 强制 <50 行修复走 docpath quick（绕过 promote）。两条规则交叉产生的缝隙：quick 闭环的 backlog 条目无法合法销账——accepted→done 被拒（实测 R-333：Illegal transition，允许列表无 done），只剩 drop（语义失实：被拒项 ≠ 已完成项）。
- 目标: backlog 状态机缝隙：quick 闭环的条目无合法路径到 done（→active 仅 promote，与 quick 强制分级冲突）
- 背景: 来自 backlog R-346
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

- [ ] AC-1: 1) 为"quick/旁路闭环"提供合法终态（如 accepted/planned → done 需附 links.task 非空校验，或新增 absorbed 状态）；2) done 前校验任务证据真实存在，防止借道逃避生命周期；3) 测试覆盖新旧转移路径；4) R-333（已 accepted 滞留）与历史同型条目可按新路径补录。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-346 与任务 T-20260913-backlog-quick-done-active-promote-quick 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
