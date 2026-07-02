# T-20260619-instant-profile-check-typecheck-r-204 - instant profile:跳 check 留 typecheck(R-204)

> backlog_id: R-215
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

运行时门禁看 workflow_profile 非 level;无档位跳 check。加 instant profile(requiresCheck=false),完成时跑轻量校验(typecheck+plan-sync+major-change-gate),跳 build+test,由 quick-guard 守卫。

## 验收

instant profile 可创建并完成,跳 build+test 保留 typecheck+plan-sync+major-change-gate;quick-guard 守卫 instant;全量测试绿+新增 instant 测试

## 2. 需求清单

### 功能需求
- [ ] FR-1: instant profile:跳 check 留 typecheck(R-204)
  - 来源 backlog: R-215

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- instant profile:跳 check 留 typecheck(R-204)

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
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: 运行时门禁看 workflow_profile(quick/standard/strict)而非 level(0-3 仅为 complexity 推荐)。无任何档位跳过 check(build+test+typecheck+plan-sync+major-change)。L0"即时响应"设计该直接执行,但运行时仍强制 check。`done --skip-check` 手动且无策略守卫。
- 目标: 加 instant profile,完成时跳 build+test,保留 typecheck+plan-sync+major-change-gate 轻量校验,由 quick-guard 范围守卫(≤3 文件、无风险路径)。
- 背景: 经核实 check 内 typecheck(tsc --noEmit)是独立检查项,与 build(tsup)/test 分离,可单独保留。quick 已跳 review(instant 同理)。
- 可选方案: (A)加 instant profile 跳 check 留 typecheck;(B)仅文档化不加档(最安全);(C)requiresCheck 配置化。已选 A。
- 推荐方案: 加 instant profile(requiresCheck=false/review=false/journal:minimal);agent.ts 对 instant 跑 checkCommand lite 模式(仅 typecheck+结构门禁);quick-guard 守卫 instant;入口为 `quick --instant` flag。
- 不做什么: 不让 instant 跳 typecheck(防低级类型错误);不跳 plan-sync/major-change-gate(结构性安全);不动 standard/strict;不改 level 语义。
- 成本: 改 workflow-profile.ts + check.ts(lite 路径)+ agent.ts + done.ts + quick.ts + quick-guard.ts + 测试,中等。
- 风险: instant 误用于大改动 → 缓解:quick-guard 范围守卫(≤3 文件、风险路径拒绝);typecheck 仍兜底类型错误。
- 回滚方案: instant 是新增 profile,git revert 单次提交即恢复;旧 profile 行为不变。
- 用户确认: 已确认(2026-06-19)。经 AskUserQuestion 两项决策:实现路径=加 instant 档跳 check;安全边界=跳 check 但留 typecheck(+plan-sync+major-change-gate,只跳 build/测试)。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-215 与任务 T-20260619-instant-profile-check-typecheck-r-204 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
