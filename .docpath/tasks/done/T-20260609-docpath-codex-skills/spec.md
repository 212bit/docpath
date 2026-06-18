# T-20260609-docpath-codex-skills - 优化 DocPath Codex Skills 文案与触发边界

> backlog_id: R-153
> backlog_source: docpath backlog add

## 1. 背景与动机

# 优化 DocPath Codex Skills 文案与触发边界

## 背景
审核发现 DocPath 相关 Codex skills 已安装且模板与安装版一致，但仍存在触发覆盖不足、product/design 与主 skill 流程重复、software skill 缺少开发前技术分析入口、software First Commands 容易在非执行态误导 agent enter 等问题。

## 目标
- 增强主 docpath skill 对开发前分析、需求分析、产品分析、UI/UX 分析、技术分析、“不要直接写代码”等请求的触发覆盖。
- 主 skill 明确无 active task 时必须遵循 status/next 推荐路线，不手写 workspace/current 或隐藏任务状态。
- product/design skills 保留领域质量标准，避免重复完整 analyze 流程。
- software skill 增加开发前技术分析质量标准，并将 agent enter 改为条件执行。
- templates/codex-skills 与 .codex/skills 保持一致。

## 非目标
- 不修改 DocPath CLI 行为。
- 不修改 install manifest 规则。
- 不重构 AGENTS.md。

## 验收
- 四个 templates/codex-skills/*/SKILL.md 按上述目标更新。
- 安装后的 .codex/skills/*/SKILL.md 与模板一致。
- install --target codex --check-only 与 --doctor 通过。
- docpath check/review/journal 通过。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 优化 DocPath Codex Skills 文案与触发边界
  - 来源 backlog: R-153

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 优化 DocPath Codex Skills 文案与触发边界

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

### Decision Brief
- 当前问题: DocPath Codex skills 触发覆盖不足，product/design/software 与主 skill 分工边界不够清晰，software 的 enter 提示可能误导非执行态。
- 目标: 优化 skill 文案与触发边界，使开发前分析、需求/UI/技术分析和不要直接写代码场景更稳定触发，同时保持 CLI 行为不变。
- 背景: 用户要求“审核docpath相关skill”后确认“修复”。
- 可选方案: A. 不改；B. 仅改主 skill；C. 同步优化主/product/design/software 四个 skill。
- 推荐方案: C，同步优化四个 skill，模板与 .codex 安装版保持一致。
- 不做什么: 不改 DocPath CLI 行为，不重构 AGENTS.md，不改变 install manifest 规则。
- 成本: 仅文案和安装版同步，维护成本低。
- 风险: skill 触发描述过宽可能增加误触发；通过边界说明和条件命令降低风险。
- 回滚方案: 恢复 templates/codex-skills 与 .codex/skills 中四个 SKILL.md 到上一版本，并刷新 install manifest。
- 用户确认: 2026-06-09 用户在审核结论后明确回复“修复”。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-153 与任务 T-20260609-docpath-codex-skills 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
