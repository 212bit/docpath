# T-20260713-journal-ai-native-trellis-update-spec - journal: AI-native 经验反哺机制 — 对标 Trellis update-spec

> backlog_id: R-265
> backlog_source: docpath backlog add

## 1. 背景与动机

# 背景

当前 `docpath done` 的 journal 阶段使用硬编码正则匹配（关键词：架构/边界/模块/接口/数据模型/状态机 + 决策/采用/改为/统一/保留/拆分）来提取决策候选，再写入 `.docpath/decisions/*.yaml`。这是一个**机械化**的方案，只能捕获匹配关键词的决策，无法理解语义，无法做内容分类（设计决策 vs 陷阱 vs 新模式 vs 反模式）。

Trellis 的 `update-spec` 则走完全不同的路线：~9700 字符的 Markdown Skill Prompt 注入 AI 上下文，让 AI 自主完成：
1. 识别“学到了什么”
2. 按 7 种类型分类（设计决策/项目约定/新模式/禁用模式/常见错误/规约/陷阱）
3. 路由到正确的 spec 文件（spec vs guides 区分）
4. 按模板写入（含 WHY/Example/签名/测试点）
5. 去重 + 索引更新

**核心差异**：Trellis 把判断权交给 AI 的语义理解能力，DocPath 则把判断权交给了正则表达式。

# 提案

在 `docpath done` → journal 阶段，引入 **AI-native 经验反哺机制**：

### 第一阶段（Prompt 注入）
- 在 journal 阶段注入一段引导 prompt（仿 Trellis update-spec 的 7 种分类 + 4 问决策树）
- Agent 上下文此时已包含完整的 spec.json / spec.md / breadcrumb / decisions，有充足材料
- Prompt 引导 Agent 回答：学到了什么？属于哪种类型？应该写到哪里？为什么值得沉淀？

### 第二阶段（结构化输出增强）
- 不仅写 decisions YAML，还可以：
  - 写 `.docpath/rules/` 下的反模式/陷阱条目
  - 更新 spec.md 的 "4. 关键决策" 表
  - 写 guides（checklist 型思维触发）
- 输出时区分 `decision` vs `anti-pattern` vs `gotcha` vs `pattern`

### 第三阶段（交互式引导，可选）
- 类似 Trellis 的 `trellis-update-spec`，对高价值条目进行交互式确认
- 用户最终决定某个经验是否存档

### 复用现有资产
- `${decision_brief}` 结构化字段 — 可以直接喂给 AI 作为优质信号源
- spec.json 中的 "4. 关键决策" 表 — 已有结构化的决策容器
- `.docpath/rules/` 目录 — 已有 rules 存放规范
- Journal 现有流程 — 在 journal 内部增强，不重建轮子

# 验收标准

1. `docpath done` → journal 输出中，Agent 能看到一段引导 prompt，列出 7 种经验类型
2. 至少支持 decisions 和 anti-patterns/gotchas 两种新内容的分类写入
3. 输出文件位置符合 DocPath 现有目录规范（decisions/ rules/ spec.md）
4. 无关键词匹配遗漏——依赖 AI 语义而非正则
5. 低信号过滤机制（一次性实现细节不沉淀）
6. 与现有 journal --agent 模式兼容

## 2. 需求清单

### 功能需求
- [ ] FR-1: journal: AI-native 经验反哺机制 — 对标 Trellis update-spec
  - 来源 backlog: R-265

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- journal: AI-native 经验反哺机制 — 对标 Trellis update-spec

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
- [x] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: # 背景
- 目标: journal: AI-native 经验反哺机制 — 对标 Trellis update-spec
- 背景: 来自 backlog R-265，Decision Brief 证据: User requested: 帮我完成 R-265
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-13 用户明确要求完成 R-265

### 已有 Decision Brief (来自 backlog evidence)

User requested: 帮我完成 R-265

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-265 与任务 T-20260713-journal-ai-native-trellis-update-spec 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
