# T-20260616-optimize-review-noise-and-closeout-guida - Optimize review noise and closeout guidance after workflow dogfood

> backlog_id: R-193
> backlog_source: docpath backlog add
> user_confirmed: 用户要求：继续回顾本次利用工作流进行开发有哪些优化点，继续优化

## 1. 背景与动机

第二轮 workflow dogfood 暴露出剩余 DX 噪声：

1. `docpath review` 仍把本次 diff 引入的问题与 touched file 中已有的文件级 warning 混在一起，操作者需要人工判断哪些是必须立即处理的回归。
2. `docpath changes --agent` 在 canonical ignored evidence 存在时仍主要提示底层 `git add -f`，没有优先引导到现在已经能消费 staging plan 的 `docpath commit --stage`。
3. `docpath done` 的 journal closeout 输出仍偏 prompt-like，信息量很大，完成路径显得嘈杂。

目标是继续降低流程噪声，保持审计信息存在，但让默认输出更贴近开发者当下需要的判断。

## 2. 需求清单

### 功能需求

- [ ] FR-1: `docpath review` 在可得 git diff 信息下区分 current-diff findings 与 baseline/whole-file findings。
- [ ] FR-2: review 输出和 review evidence 展示 current-diff 与 baseline/whole-file warning/info 计数。
- [ ] FR-3: `docpath changes --agent` 在 canonical ignored evidence 存在时推荐 `docpath commit --stage`，同时保留精确 `git add -f` fallback。
- [ ] FR-4: `docpath done` / journal closeout 输出在常规自动归档时减少 prompt 噪声，但不丢失任务 evidence。

### 非功能需求

- [ ] NFR-1: 不削弱 review/check/done 标准门禁。
- [ ] NFR-2: 不隐藏 warning，只分类和降噪。
- [ ] NFR-3: 保持 machine-readable 输出向后兼容，新增字段优先。
- [ ] NFR-4: 聚焦测试覆盖 review 分类和 closeout guidance。

## 3. 范围界定

### 包含

- Review diff-line overlap 分类。
- Review evidence schema 追加非破坏字段。
- Changes closeout guidance 字段/文案。
- Journal/done 输出降噪的局部改进。
- 相关测试。

### 不包含

- 完整历史 warning baseline 数据库。
- 改写 review analyzer 规则体系。
- 改变标准 workflow gate 的必需性。
- 自动提交或自动 staging 当前工作树。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | warning 降噪方式 | 隐藏旧 warning / 分类展示 | 分类展示 | 不掩盖风险，同时突出 current-diff 回归 |
| 2 | closeout 引导 | 只给 git add -f / 推荐 docpath commit --stage + fallback | 推荐 docpath commit --stage + fallback | 使用 DocPath 自身封装降低操作成本，保留透明底层命令 |
| 3 | journal 降噪 | 删除 evidence / 收敛默认输出 | 收敛默认输出 | evidence 仍要保留，只减少终端噪声 |

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
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: 第二轮使用中，review/closeout/done 输出仍需要操作者人工过滤低信号内容。
- 目标: 在不弱化门禁和 evidence 的前提下，把当前回归、历史/文件级 warning、推荐 closeout 动作区分清楚。
- 背景: 上一轮已实现 quick profile、gate reuse、canonical staging 等基础能力，本轮让输出消费这些能力。
- 可选方案: 保持现状；隐藏 warning；分类 warning 并改进 closeout guidance。
- 推荐方案: 分类展示，新增字段，不删除原有信息；changes 输出推荐 `docpath commit --stage` 并保留 `git add -f` fallback。
- 不做什么: 不实现完整历史 warning 数据库；不自动提交；不跳过 review/check。
- 成本: 小到中等，集中在 review、changes、journal/done 输出和测试。
- 风险: diff-line 分类可能不完美。缓解：命名为 current-diff / baseline-or-whole-file，避免过度承诺。
- 回滚方案: 新增字段和文案可独立 revert，原有 gate 行为不变。
- 用户确认: 用户明确要求继续回顾并继续优化。

## 5. 验收标准

- [ ] AC-1: review findings/evidence 能区分 current-diff 与 baseline/whole-file 类别。
- [ ] AC-2: review 输出显示 current-diff vs baseline/whole-file 的 warning/info 计数。
- [ ] AC-3: changes agent/json output 在 canonical ignored evidence 存在时包含 `docpath commit --stage` 推荐，同时保留 `git add -f` fallback。
- [ ] AC-4: done/journal 常规 closeout 输出减少 prompt 噪声，任务 evidence 仍存在。
- [ ] AC-5: 相关测试通过，且 `pnpm run typecheck`、目标测试、`docpath check/review/done` 通过或残留问题被记录。
