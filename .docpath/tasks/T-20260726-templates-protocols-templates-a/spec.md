# T-20260726-templates-protocols-templates-a - 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)

> backlog_id: R-297
> backlog_source: docpath backlog add

## 1. 背景与动机

协议契约存在 root/templates/templates-protocols/.docpath-protocols 多层载体，R-273/R-277/R-290 均为「修一层漏一层」事故。2026-07-27 勘察：root↔templates 已被 install manifest drift 治理；无人治理的是 templates/<flavor>.md ↔ templates/protocols/<flavor>.md 层，实锤三处漂移（protocols/OPENCODE 缺 71 行 worktree 章节、templates/AGENTS 写死 "docpath" 会漏入其它项目、CODEX 无 protocols 副本）。flavor 间为措辞重写（9% 重叠）非复制，不在本任务范围。

方案 A 收敛版（用户确认方案 A 后按其意图收敛为删层）：templates/protocols/ 成为唯一手写 canonical 层（4 flavor 齐全、参数化、修复三处漂移）；install/init 等消费方改读 canonical；删除 templates 根层 4 份重复文件并加防复辟断言；root 与 .docpath/protocols 分发机制不变。详见 .docpath/backlog/analysis/R-297-analysis.md。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-297-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
  - 来源 backlog: R-297

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)

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
- 当前问题: 协议契约存在 root/templates/templates-protocols/.docpath-protocols 多层载体，R-273/R-277/R-290 均为「修一层漏一层」事故。2026-07-27 勘察：root↔templates 已被 install manifest drift 治理；无人治理的是 templates/<flavor>.md ↔ templates/protocols/<flavor>.md 层，实锤三处漂移（protocols/OPENCODE 缺 71 行 worktree 章节、templates/AGENTS 写死 "docpath" 会漏入其它项目、CODEX 无 protocols 副本）。flavor 间为措辞重写（9% 重叠）非复制，不在本任务范围。
- 目标: 协议单源: templates/protocols 唯一手写层, 删除 templates 根层重复副本 (方案 A 收敛)
- 背景: 来自 backlog R-297，Decision Brief 证据: 方案 A(层间单源) 用户 2026-07-27 选定; 管线精读后收敛为删层: root↔templates 已有 install drift 治理, 真空层直接消灭优于新增 sync 机制; 备选 B(共享段注入)留后续, C(全量单源)勘察数据不支持
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-27 用户于方案比选中选定方案 A（层间单源，推荐项）

### 已有 Decision Brief (来自 backlog evidence)

方案 A(层间单源) 用户 2026-07-27 选定; 管线精读后收敛为删层: root↔templates 已有 install drift 治理, 真空层直接消灭优于新增 sync 机制; 备选 B(共享段注入)留后续, C(全量单源)勘察数据不支持

## 5. 验收标准

- [ ] AC-1: 手写层唯一（templates/protocols/ 4 flavor 参数化），templates 根层协议文件删除+防复辟断言。
- [ ] AC-2: install 各 target 资产等价迁移（AGENTS 写死名修复），install/doctor 测试全绿。
- [ ] AC-3: protocols/OPENCODE 补齐 worktree 章节，R-290 修正在 4 份源保持。
- [ ] AC-4: init 与 install 同源；全量套件绿。
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-297 与任务 T-20260726-templates-protocols-templates-a 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
