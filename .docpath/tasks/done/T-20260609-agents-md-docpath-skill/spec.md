# T-20260609-agents-md-docpath-skill - 瘦身 AGENTS.md 减少与 DocPath Skill 重叠

> backlog_id: R-151
> backlog_source: docpath backlog add

## 1. 背景与动机

# 瘦身 AGENTS.md，减少与 DocPath Skill 重叠

## Background
用户确认 AGENTS.md 与 .codex/skills/docpath/SKILL.md 存在重叠，要求可以瘦身。目标是让 AGENTS.md 保留项目级总入口与项目特有规则，避免复制 Skill 的完整操作手册。

## Acceptance
- AGENTS.md 不再重复 DocPath Skill 的详细工作流步骤。
- AGENTS.md 明确指向 .codex/skills/docpath/SKILL.md / templates/codex-skills/docpath/SKILL.md 作为 Skill 权威说明。
- 保留项目级约束：不要 push、用 node dist/index.js 验证、修改前走 DocPath workflow、状态异常时先修 gate。
- 验证 AGENTS 与 Skill 的职责边界清晰。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 瘦身 AGENTS.md 减少与 DocPath Skill 重叠
  - 来源 backlog: R-151

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 瘦身 AGENTS.md 减少与 DocPath Skill 重叠

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

### Decision Brief
- 当前问题: AGENTS.md 与 DocPath Skill 重叠，容易让 Agent 读取旧路线或重复规则。
- 目标: AGENTS.md 保留项目级入口和约束，Skill 保留可安装的详细操作手册。
- 背景: 用户已确认可以瘦身。
- 可选方案: A 保留重复；B AGENTS瘦身并指向Skill；C 删除AGENTS。
- 推荐方案: B。
- 不做什么: 不改 CLI 行为，不改 Skill 详细流程，不 push。
- 成本: 文档小改和验证。
- 风险: 引用路径不准确；项目级约束遗漏。
- 回滚方案: git checkout -- AGENTS.md。
- 用户确认: 用户在对话中确认“同意，可以”，允许瘦身 AGENTS.md，调整项目级 Agent 指引与 Skill 职责边界。

## 5. 验收标准

- [x] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: AGENTS.md 瘦身后不复制 Skill 详细步骤
- [ ] AC-3: AGENTS.md 明确 Skill 权威路径与项目级约束
- [ ] AC-2: backlog 条目 R-151 与任务 T-20260609-agents-md-docpath-skill 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
