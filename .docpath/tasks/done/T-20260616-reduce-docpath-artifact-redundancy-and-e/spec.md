# T-20260616-reduce-docpath-artifact-redundancy-and-e - Reduce DocPath Artifact Redundancy and Establish Generation Policy

**任务 ID**: T-20260616-reduce-docpath-artifact-redundancy-and-e
**状态**: 草稿
**来源**: backlog R-195

## 1. 背景与动机

### 问题
DocPath 当前生成大量冗余 Markdown 渲染视图：
- 523 个 .md 文件 vs 70 个 .json 文件
- decisions.md 已膨胀到 235K
- 每个任务都有 spec.json+spec.md、plan.json+plan.md 双份
- CLAUDE.md 协议明确"不要默认读取 .md 视图"，但系统仍在生成
- 估计浪费约 1M tokens

### 目标
- 立即减少 ~300K tokens 消耗（Phase 1：清理）
- 建立清晰的文档生成策略（Phase 2：规范）
- 为长期优化奠定基础（Phase 3：评估完全移除任务级 MD）

## 2. 需求清单

### 功能需求
- [ ] FR-1: 归档 workspace/decisions.md 按月分割
- [ ] FR-2: 删除 workspace 临时渲染视图（compact-context.md, worktree-*.md）
- [ ] FR-3: 创建 docs/workflows/artifact-policy.md 定义文档生成策略
- [ ] FR-4: 添加配置开关控制 MD 视图生成
- [ ] FR-5: 修改 writeStructuredTaskJson 支持配置化 MD 生成
- [ ] FR-6: 保留必要视图（current.md, last-check.md, review.md）

### 非功能需求
- [ ] NFR-1: 保持向后兼容（已存在 .md 文件不报错）
- [ ] NFR-2: 按需渲染性能 < 100ms
- [ ] NFR-3: Git 历史中的 canonical 证据路径不变
- [ ] NFR-4: 配置变更可在 debug.json 追溯

## 3. 范围界定

### 包含
- Phase 1: workspace/ 临时视图清理
- Phase 1: decisions.md 按月归档
- Phase 2: artifact-policy.md 文档创建
- Phase 2: 配置开关添加（ArtifactConfig 接口）
- Phase 2: writeStructuredTaskJson 条件化 MD 生成
- Phase 2: 测试覆盖（配置生效、按需渲染、向后兼容）

### 不包含
- 不删除 JSON 真值源文件
- 不改变 .docpath/tasks/<task_id>/ canonical 路径
- 不改变 check/review/journal 门禁策略
- 不删除历史任务目录
- Phase 3（完全移除任务级 MD）不在本次范围

### 待确认
- 是否需要迁移脚本清理已存在项目的冗余文件

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | MD 生成策略 | A. 完全移除 B. 按需生成 C. 保持现状 | B. 按需生成 | 平衡可用性和效率，风险可控 |
| 2 | 配置默认值 | generate_md_views: true/false | false | 新项目默认不生成，减少浪费 |
| 3 | 清理方式 | A. 手动删除 B. CLI 命令 C. Git 操作 | C. Git 操作（可回滚） | 安全且可追溯 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为（减少默认生成的文件）
- [x] 架构 / 模块边界（配置化文档生成）

### Decision Brief
- **当前问题**: 大量冗余 MD 文件浪费 token，但 JSON 是唯一真值源
- **目标**: 减少 token 消耗，建立清晰文档策略
- **背景**: CLAUDE.md 已规定 Agent 不应默认读 MD，但系统仍在生成
- **可选方案**:
  - A. 保持现状（简单但持续浪费）
  - B. 完全移除 MD（激进，可能影响人类可读性）
  - C. 按需生成（平衡，本方案）
- **推荐方案**: C. 按需生成，配置默认 false
- **不做什么**: 不删除 JSON 真值源，不改变 canonical 证据路径
- **成本**: 开发约 4-6 小时，测试 2 小时
- **风险**: 外部工具可能直接读 MD（但 CLAUDE.md 已明确协议）
- **回滚方案**: Git revert + 配置开关立即回退
- **用户确认**: 已通过本次任务启动确认

## 5. 验收标准

- [ ] AC-1: workspace/decisions.md 按月归档，主文件 < 50K
- [ ] AC-2: compact-context.md, worktree-analysis.md, worktree-decision.md 已删除
- [ ] AC-3: docs/workflows/artifact-policy.md 存在且完整
- [ ] AC-4: config schema 包含 artifacts.generate_md_views 字段
- [ ] AC-5: writeStructuredTaskJson 读取配置，条件化生成 MD
- [ ] AC-6: 测试覆盖：配置生效、按需渲染、向后兼容
- [ ] AC-7: docpath render --view spec/plan 可从 JSON 重建 MD
- [ ] AC-8: 已存在 MD 文件不导致错误
- [ ] AC-9: 估算 token 消耗减少 ~300K

## 6. 风险与依赖

### 风险
- 人类手动修改 MD 后，与 JSON 不一致（已有 drift 检测机制）
- 外部脚本可能假设 MD 总是存在（但 CLAUDE.md 已规定协议）

### 依赖
- 现有 docpath render 命令（已存在，无需新增）
- 现有 docpath journal 归档逻辑（需验证按月分割）

### 缓解措施
- Git 操作可回滚
- 配置开关可立即切换行为
- 保留向后兼容（已存在 MD 不报错）

## 7. 后续工作流

- 运行 `docpath write-spec --stdin` 写入本 spec
- 运行 `docpath plan` 生成执行计划
- 运行 `docpath go --step S1` 开始执行
