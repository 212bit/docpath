# T-20260609-ui-ux-design-preview-gate-visual-accepta - 为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance

> backlog_id: R-155
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

UI/UX 类任务仅有 analysis/spec/plan 不足以约束视觉结果。UI/UX 整体重构虽补充了分析和计划，但实现后用户仍极其不满意，说明流程缺少设计预览冻结、视觉验收与用户确认门禁。

当前失败模式不是“没有分析”，而是：
- 分析偏产品/信息架构，缺少可审阅的视觉意图；
- spec 没有冻结首屏布局、导航、组件密度、视觉风格；
- plan 没有在编码前要求 Design Preview；
- review/check 没有把实际页面与预览进行 Visual Acceptance 对比。

## 验收

- [ ] UI/UX 任务在进入实现前必须产出 Design Preview，可为 wireframe、HTML snapshot 或关键页面说明。
- [ ] Design Preview 必须包含信息架构、首屏布局、导航、主要组件、视觉风格、移动端可读性边界。
- [ ] 用户确认 Design Preview 后才允许进入实现；若用户不满意，必须回到 analysis/spec/plan 修正。
- [ ] review/check 阶段必须执行 Visual Acceptance，对比预览与实际页面，并记录偏差。
- [ ] 首版不强制 screenshot，但必须支持 HTML snapshot 作为可审阅证据。
- [ ] 该门禁应集成到 DocPath 流程文档或命令提示中，降低 Agent 仅凭文字直接编码 UI 的风险。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance
  - 来源 backlog: R-155

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance

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
- [x] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: UI/UX 重构任务虽然补充了 analysis/spec/plan，但仍可能在编码完成后才暴露视觉方向不符合用户预期；说明现有流程缺少“编码前可审阅的设计预览”和“编码后可执行的视觉验收”。
- 目标: 对 UI/UX、UI、前端页面、组件布局类任务增加 Design Preview Gate 与 Visual Acceptance，要求在写代码前冻结视觉意图，review/check 阶段能够对照验收。
- 背景: 用户已明确反馈“添加代码前分析是为了避免这种情况，但没有改善”，并要求创建 P0 backlog “为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance”；R-155 已由用户审批为 accepted 并要求继续实现。
- 可选方案: A. 只加强文档提示；B. 增加独立 design-preview/visual-acceptance 文档与 CLI 写入命令；C. 强制 screenshot 自动化。
- 推荐方案: 采用 B。首版增加 `docpath write-design` 与 `docpath check` 的 UI/UX 设计门禁；HTML snapshot/设计说明作为最低证据，不强制 screenshot。
- 不做什么: 不强制所有非 UI 任务写设计文档；不在首版引入截图自动化硬依赖；不替代人工视觉审阅。
- 成本: UI/UX 类任务会多写两份短文档，并增加一次用户/Reviewer 对齐成本；check 规则需要维护关键词与质量阈值。
- 风险: 关键词识别可能误判 UI/UX 任务；文档可能形式化。通过仅对疑似 UI/UX 任务触发、保留人工 review、后续迭代规则降低风险。
- 回滚方案: 移除 `write-design` 命令注册与 `checkUiUxDesignGate` 检查，保留已生成的设计文档作为普通任务附件。
- 用户确认: 已确认。用户先反馈现有“开发前分析”不能避免不满意 UI，随后要求创建 P0 backlog “为 UI/UX 任务增加 Design Preview Gate 与 Visual Acceptance”，并执行 `docpath backlog accept R-155` 后要求“继续”。

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-155 与任务 T-20260609-ui-ux-design-preview-gate-visual-accepta 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
