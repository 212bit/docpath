# T-20260616-add-backlog-promote-draft-flag-for-fast- - Add backlog promote --draft flag for fast-track workflow

> backlog_id: R-197
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

当前流程：capture → edit (多次) → accept → promote，需要 5+ 个命令才能开始工作。对于简单任务或快速原型，这个流程过于繁琐。

## 验收

docpath backlog promote --draft R-xxx 可以跳过成熟度检查直接创建任务；或 docpath quick 支持直接从 backlog 条目启动

## 2. 需求清单

### 功能需求
- [ ] FR-1: Add backlog promote --draft flag for fast-track workflow
  - 来源 backlog: R-197

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Add backlog promote --draft flag for fast-track workflow

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
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: 简单任务/快速原型走完整 capture→edit→accept→promote 需 5+ 命令；readiness≥analyzed / evidence / user_confirmed 成熟度门禁对低风险小任务过重，启动成本高。
- 目标: 为低风险快速任务提供 opt-in fast-track：一条 `docpath backlog promote --draft R-xxx` 跳过成熟度检查直接建任务进 planning。
- 背景: assertBacklogReadyForExecution(item, 'promote', skipCheck) 已有 skipCheck 第三参数通路；--draft flag 已在 register 暴露并在 backlog.ts:608/648 接入。实现先于本次门禁文档完成（流程倒置，本次补齐）。
- 可选方案: A) promote --draft 跳过成熟度（已实现）；B) docpath quick 直接从 backlog 条目启动；C) 降低全局成熟度门槛（破坏门禁语义，否决）。
- 推荐方案: A。opt-in、默认行为不变、复用既有 skipCheck 通路、改动面最小。B 会与 quick 现有职责重叠且需新增 backlog→quick 桥接。
- 不做什么: 不改默认 promote 行为；不废除成熟度门禁本身（--draft 是显式 opt-out，仅 promote/accept/plan 三动作生效）；不给所有低 level 条目自动开 fast-track。
- 成本: 代码已实现并提交，边际≈0；需补 --draft 专项测试（当前零覆盖）。
- 风险: ① 滥用 --draft 绕过用户确认让未确认需求进入执行 → opt-in + spec 仍带 4.1 门禁。② 无测试守护，skipCheck 通路回归无感知 → 本次补测试。③ 实现先于门禁的流程倒置 → 本次补 Decision Brief + 用户确认。
- 回滚方案: --draft 为纯增量 flag，移除 register 选项即恢复严格门禁；不影响已 promote 任务。
- 用户确认: 用户 2026-06-17 会话确认采纳 --draft fast-track opt-in 方案，接受实现先于门禁的现状

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-197 与任务 T-20260616-add-backlog-promote-draft-flag-for-fast- 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*

## Journal Record

### 📝 任务摘要
为 backlog promote `--draft` fast-track 补齐状态机支持与专项测试，并修复一批预先存在的 TS 编译错误。

### 🏗️ 架构决策
- 决策1: 状态机 `BACKLOG_TRANSITIONS` 放开 `proposed → active`（而非在 promote 命令内串联中间态）。原因：单点修改、fast-track 语义清晰、复用既有 transitionBacklog fail-loud 机制，避免命令内隐式多步转换。
- 决策2: `--draft` 作为纯 opt-in flag，不改变默认 promote/accept/plan 的成熟度门禁。原因：保护既有严格门禁语义，fast-track 仅在显式 opt-in 时生效。

### 💡 经验教训
- 教训1: 零测试覆盖的功能性 bug 会以"半成品"形态潜伏——`--draft` 跳过了成熟度门禁却撞上状态机非法转换，目标场景（proposed 条目）完全失效，但无测试致漏网。功能实现必须配套覆盖目标场景的测试。
- 教训2: 实现（--draft 代码通路）先于门禁文档（Decision Brief）完成是流程倒置；门禁文档补齐时才发现状态机缺陷，说明门禁本身有拦截价值，不能跳过。
- 教训3: 会话前遗留改动与本任务改动混在工作区时，分两次提交（按主题）比一次性提交更利于追溯和回滚。

### 🔮 后续改进
- 改进1: 为 `nextBacklogId` 扫描 archived 目录的新行为补专项测试（archived 含 R-005 时新建应分配 R-006），当前仅随全量测试间接覆盖。
- 改进2: agent-output.ts 多个函数过长（generateAgentOutput 149 行）属技术债，未来可拆分。
- 改进3: 修复 `install-manifest-drift` warning（docpath install --target universal）与 docs-index 陈旧（docpath docs scan）两个非阻塞项。

