# T-20260929-feat-workflow-commit-arch-fr - feat(workflow): 多步骤启动全景、commit延期提示、单步arch守卫与FR智能拆解增强

> backlog_id: R-441
> backlog_source: docpath start

## 1. 背景与动机

- feat(workflow): 多步骤启动全景、commit延期提示、单步arch守卫与FR智能拆解增强

## 2. 需求清单

### 功能需求
- [ ] FR-1: 多步骤启动全景
  - 来源 backlog: R-441
- [ ] FR-2: commit延期提示
- [ ] FR-3: 单步arch守卫
- [ ] FR-4: FR智能拆解增强

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- feat(workflow): 多步骤启动全景、commit延期提示、单步arch守卫与FR智能拆解增强

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
- 当前问题: 多步骤启动缺乏全貌透出、中间态 commit 缺乏延期提示、单步交接缺乏增量 arch 守卫、Backlog 复合序号格式提取不全。
- 目标: 落地 4 项工作流效能增强：
  1. FR-1: `docpath start` 冷启动透出步骤拓扑全景与推进提示；
  2. FR-2: `step-pass --commit` 在非终步输出显式的延迟提交反馈；
  3. FR-3: `step-pass` 单步交接集成轻量架构分层防腐巡检；
  4. FR-4: `extractFunctionalRequirements` 支持序号（1./(1)/①）与分号复合语法拆解。
- 背景: 用户同意推进 4 项优化建议。
- 可选方案:
  - 方案 A (推荐): 在 start、step-pass、backlog 模块中增量落地 4 项增强，配齐针对性测试。
  - 方案 B: 仅修改提示层，不接入 arch 巡检。
- 推荐方案: 方案 A
- 决策理由: 方案 A 既提升了开发者可观测性与操作确定性，又真正实现了「小步快跑 + 每步 arch 兜底」。
- 不做什么: 不修改底层 FSM 核心流转。
- 成本: 低，改动量约 80-100 行。
- 风险: 极低，均为非破坏性增强。
- 回滚方案: Git revert 提交。
- 用户确认: 用户已在会话中明确同意推进这 4 项优化。

## 5. 验收标准

- [ ] AC-1: 多步骤启动全景 满足功能要求并通过测试
- [ ] AC-2: commit延期提示 满足功能要求并通过测试
- [ ] AC-3: 单步arch守卫 满足功能要求并通过测试
- [ ] AC-4: FR智能拆解增强 满足功能要求并通过测试
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-441 与任务 T-20260929-feat-workflow-commit-arch-fr 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
