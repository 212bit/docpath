# T-20260726-b-blocks-render-check - 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验

> backlog_id: R-300
> backlog_source: docpath backlog add

## 1. 背景与动机

R-297 完成层间单源后，flavor 间（CLAUDE/AGENTS/CODEX/OPENCODE）仍是同义异文的手工对齐关系。2026-07-27 勘察实证：worktree-isolation 契约段三份文本已分叉（CODEX/OPENCODE 为删减变体，R-273 反模式细节与 id 分配说明仅存于 CLAUDE 版）；lifecycle 命令序内核在 CLAUDE/CODEX 逐字相同、AGENTS 多一行前缀、OPENCODE 为分阶段变体。语义变更需人工同步 N 份的模式即 R-290 事故类。用户选定方案 B：共享契约段抽块注入，flavor 措辞保留手写。

1. 块源层 templates/protocols/blocks/：lifecycle-commands（6 行命令序内核）、worktree-isolation（R-238/R-273 共享模型全文，统一到最全版本）；blocks/README 记录各块覆盖面与选择退出（OPENCODE 保留分阶段 lifecycle 变体、AGENTS 无 worktree 章节）。
2. 标记注入：flavor canonical 内用 <!-- docpath:block <name> --> ... <!-- /docpath:block --> 包裹共享区；lifecycle 注入 CLAUDE/CODEX/AGENTS（AGENTS 拆出 quick 前缀行），worktree 注入 CLAUDE/CODEX/OPENCODE。
3. 渲染器 utils/protocol-blocks.ts + docpath render --view protocols（复用既有 hidden 命令，不新增命令面）：幂等重渲染注入区，未知块名 fail-loud。
4. check 新增 protocol-blocks 一致性校验（仅 templates/protocols/blocks 存在时生效）：注入区 ≠ 块源渲染 → fail-loud 指向 render 命令——不自动写盘，遵守 gate 去写副作用原则；root 副本继续由 install manifest drift 治理（分层治理不重叠）。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-297-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
  - 来源 backlog: R-300

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验

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
- 当前问题: R-297 完成层间单源后，flavor 间（CLAUDE/AGENTS/CODEX/OPENCODE）仍是同义异文的手工对齐关系。2026-07-27 勘察实证：worktree-isolation 契约段三份文本已分叉（CODEX/OPENCODE 为删减变体，R-273 反模式细节与 id 分配说明仅存于 CLAUDE 版）；lifecycle 命令序内核在 CLAUDE/CODEX 逐字相同、AGENTS 多一行前缀、OPENCODE 为分阶段变体。语义变更需人工同步 N 份的模式即 R-290 事故类。用户选定方案 B：共享契约段抽块注入，flavor 措辞保留手写。
- 目标: 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
- 背景: 来自 backlog R-300，Decision Brief 证据: 方案 B 为 R-297 方案比选中的既列选项, 用户 2026-07-27 显式选定; 勘察实证 worktree 段三份已分叉支撑必要性; check 校验采 fail-loud 而非自愈写盘(gate 去写副作用原则, 与 R-287 任务运行时视图自愈的边界区分)
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-27 用户显式选定方案 B

### 已有 Decision Brief (来自 backlog evidence)

方案 B 为 R-297 方案比选中的既列选项, 用户 2026-07-27 显式选定; 勘察实证 worktree 段三份已分叉支撑必要性; check 校验采 fail-loud 而非自愈写盘(gate 去写副作用原则, 与 R-287 任务运行时视图自愈的边界区分)

## 5. 验收标准

- [ ] AC-1: 两块源落地，注入区渲染幂等（连续 render 零 diff）；未知块名 fail-loud。
- [ ] AC-2: 覆盖面达成（lifecycle 3/4 + worktree 3/4，每 flavor ≥1 块），worktree 三份分叉收敛到块源全文。
- [ ] AC-3: check 在注入区漂移时 fail-loud 并给出 render 命令；块源修改经 render 一次收敛全部注入点。
- [ ] AC-4: 全量套件绿；root 副本经 install 机制同步后 manifest 全绿。
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-300 与任务 T-20260726-b-blocks-render-check 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
