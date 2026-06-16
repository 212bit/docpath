# DocPath Artifact Generation Policy

> 定义 DocPath 系统生成哪些文件、何时生成、如何控制

## 概述

DocPath 使用 JSON 作为唯一机器真值源，Markdown 作为人类可读渲染视图。本策略定义哪些文件是必需的、哪些是可选的、以及如何配置生成行为。

## 文件分类

### 必需文件（Machine Truth）

这些文件是 DocPath 状态机的真值源，必须存在且不可删除：

**Workspace 状态**
- `.docpath/workspace/state.json` - 工作流状态机
- `.docpath/workspace/breadcrumb.jsonl` - 执行历史事件流
- `.docpath/workspace/decisions.jsonl` - 决策记录（JSONL 格式）
- `.docpath/workspace/check-history.json` - 质量检查历史
- `.docpath/workspace/review.json` - 代码审查结果

**任务文档**
- `.docpath/tasks/<task_id>/spec.json` - 任务规约（结构化）
- `.docpath/tasks/<task_id>/plan.json` - 执行计划（结构化）

**索引与配置**
- `.docpath/docs-index.json` - 文档导航索引
- `.docpath/.install-meta.json` - 安装元数据

### 可选文件（Rendered Views）

这些文件从 JSON 真值源派生，可按需生成，不应默认持久化：

**Workspace 视图**
- `.docpath/workspace/current.md` - 当前状态摘要（保留，轻量）
- `.docpath/workspace/breadcrumb.md` - 执行历史渲染（按需生成）
- `.docpath/workspace/last-check.md` - 最近检查结果（保留，< 1K）
- `.docpath/workspace/review.md` - 审查报告（保留，< 5K）
- `.docpath/workspace/decisions.md` - 决策日志主文件（保留，按月归档）
- `.docpath/workspace/decisions-YYYY-MM.md` - 决策归档（自动生成）

**任务视图**
- `.docpath/tasks/<task_id>/spec.md` - 规约渲染视图（可选）
- `.docpath/tasks/<task_id>/plan.md` - 计划渲染视图（可选）

**临时/分析文件（已废弃）**
- ~~`.docpath/workspace/compact-context.md`~~ - 已删除
- ~~`.docpath/workspace/worktree-analysis.md`~~ - 已删除  
- ~~`.docpath/workspace/worktree-decision.md`~~ - 已删除

### 特殊文档（Conditional）

这些文档只在特定条件下生成：

**输出合约文档**
- 文件名: `<task_id>/output-contract.md`
- 触发条件: 任务改变 CLI 命令输出合约
- 位置: 任务 canonical 目录
- 示例: T-20260616-reduce-docpath-agent-output-and-document/output-contract.md

**设计文档**
- 文件名: `<task_id>/design-brief.md`
- 触发条件: UI/UX 设计任务，spec.json 的 `ui_gate.state === "required"`
- 位置: 任务 canonical 目录
- 内容: 目标用户、入口点、数据范围、交互模型

**决策文档**
- 文件名: `<task_id>/decision-brief.md`
- 触发条件: spec.json 的 `major_change_gate.required === true`
- 位置: 任务 canonical 目录
- 内容: 当前问题、目标、背景、可选方案、推荐方案、风险、回滚方案、用户确认

**规范证据**
- 文件名: `<task_id>/canonical.md`
- 触发条件: 非标准证据路径需要明确定义
- 位置: 任务 canonical 目录
- 内容: 定义哪些文件是 canonical 证据，用于 `docpath changes` 验证

**快速任务证据**
- 文件名: `<task_id>/quick.md`
- 触发条件: 使用 `docpath quick` 创建的轻量任务
- 位置: 任务 canonical 目录
- 内容: 简化的任务描述和验收标准

## 配置参数

### Artifact Config Schema

```typescript
interface ArtifactConfig {
  /** 是否默认生成 Markdown 渲染视图 */
  generate_md_views: boolean;  // 默认: false
  
  /** 是否支持按需渲染 */
  generate_on_demand: boolean;  // 默认: true
  
  /** decisions.md 自动归档配置 */
  archive_decisions_monthly: boolean;  // 默认: true
  
  /** decisions.md 保留窗口（天） */
  decisions_retention_days: number;  // 默认: 30
  
  /** 保留的 workspace 视图列表 */
  keep_workspace_views: string[];  // 默认: ['current.md', 'last-check.md', 'review.md']
}
```

### 配置位置

- **全局配置**: `.docpath/config.json`（影响所有项目）
- **项目配置**: 项目根目录 `.docpath/config.json`（覆盖全局）
- **默认值**: 代码中的 `DEFAULT_ARTIFACT_CONFIG`

### 配置示例

```json
{
  "artifacts": {
    "generate_md_views": false,
    "generate_on_demand": true,
    "archive_decisions_monthly": true,
    "decisions_retention_days": 30,
    "keep_workspace_views": ["current.md", "last-check.md", "review.md"]
  }
}
```

## 按需渲染

当 `generate_md_views` 为 `false` 时，使用 `docpath render` 命令按需生成：

```bash
# 渲染单个视图
docpath render --view spec
docpath render --view plan
docpath render --view breadcrumb
docpath render --view current
docpath render --view check
docpath render --view review

# 渲染所有视图
docpath render --all

# JSON 格式输出（包含路径和内容）
docpath render --view spec --json
```

## 生成时机

### 自动生成（必需文件）
- `state.json`: 每次工作流状态变更
- `breadcrumb.jsonl`: 每次执行操作
- `*.json` 任务文件: `docpath write-spec`, `docpath write-plan`
- `decisions.jsonl`: `appendDecision()` 调用

### 条件生成（可选文件）
- `*.md` 任务视图: 仅当 `artifacts.generate_md_views === true`
- `current.md`: `syncCurrentDocument()` 调用
- `decisions.md`: 从 `decisions.jsonl` 渲染，保持与 JSONL 同步

### 按需生成（命令触发）
- `docpath render --view <name>`: 显式渲染请求
- `docpath status --agent`: 可能触发 `current.md` 同步
- `docpath gc-decisions`: 归档并重新渲染 `decisions.md`

## 向后兼容

### 已存在文件处理
- 如果 `.md` 文件已存在，读取时优先使用结构化 JSON，fallback 到 MD
- 配置变更不会删除已存在的 `.md` 文件
- Drift 检测会提示 JSON 与 MD 不一致

### 迁移路径
1. 新项目：默认 `generate_md_views: false`
2. 老项目：保持现有行为，可选配置开关
3. 清理：使用 Git 操作删除冗余文件（可回滚）

## Token 消耗优化

### 立即收益（Phase 1）
- 删除临时视图：~20K tokens
- 归档 decisions.md：~70K tokens（235K → 173K）
- 总计：~300K tokens 立即节省

### 中期收益（Phase 2）
- 默认不生成任务级 MD：每个任务节省 ~10K tokens
- 70 个任务 × 10K = 700K tokens

### 长期收益（Phase 3 评估）
- 完全移除任务级 MD 持久化
- 所有视图按需渲染
- 估计总节省：~1M tokens

## 相关命令

- `docpath gc-decisions [--retention-days N]` - 归档决策日志
- `docpath render --view <name>` - 按需渲染视图
- `docpath render --all` - 渲染所有视图
- `docpath check` - 验证文件完整性（包括 JSON 真值源）
- `docpath changes` - 检查 canonical 证据和工作树状态

## 参考

- CLAUDE.md: "不要默认读取 .md 视图，优先使用 CLI 路由"
- output-contract.md: T-20260616-reduce-docpath-agent-output-and-document
- 决策日志: workspace/decisions.md (ADR 条目)

---

*Last updated: 2026-06-16*
*Related task: T-20260616-reduce-docpath-artifact-redundancy-and-e*
