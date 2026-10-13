# T-20261001-install-r-460-block - install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）

> backlog_id: R-462
> backlog_source: docpath backlog add

## 1. 背景与动机

# 模板正文协议漂移检测门禁（R-462）

协议单一源已确立为 `templates/protocols/`。但现有 `syncProtocolBlocks` 只检测 `<!-- docpath:block -->` 注入区是否漂移，**不检测 block 之外的正文协议文本**（如 R-460 的 next_hint 条款、Start/Resume 段落等）。R-460 曾发生「根目录 AGENTS.md 已含、模板母版缺失」的正文漂移，未被任何门禁拦截，直到手动 diff 才暴露。

给 DocPath 增加「正文协议漂移检测」：在 `check` / `install` 时，将可参数化渲染模板（templates/protocols/）与仓库实际协议根文件（AGENTS.md/CLAUDE.md/CODEX.md/OPENCODE.md）做正文级 diff，报告哪些仓库文件相对模板母版发生了**非预期的正文偏离**（非 block、非 {{PROJECT_NAME}} 参数化差异），按阈值判定为漂移。

- 阈值：忽略 `{{PROJECT_NAME}}` 参数化替换差异；忽略本地定制的 AGENTS.md？需定义「漂移 vs 有意定制」判定。

## 2. 需求清单

### 功能需求
- [ ] FR-1: install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）
  - 来源 backlog: R-462

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）

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
- 当前问题: 协议单一源已确立为 `templates/protocols/`。但现有 `syncProtocolBlocks` 只检测 `<!-- docpath:block -->` 注入区是否漂移，**不检测 block 之外的正文协议文本**（如 R-460 的 next_hint 条款、Start/Resume 段落等）。R-460 曾发生「根目录 AGENTS.md 已含、模板母版缺失」的正文漂移，未被任何门禁拦截，直到手动 diff 才暴露。
- 目标: install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）
- 背景: 来自 backlog R-462
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 新增模板正文漂移检测逻辑，能识别「模板母版新增了正文条款（如 R-460 句式）而仓库协议文件未同步」为漂移；无漂移时不误报。
- [ ] AC-2: 漂移检测产生机器可读报告，并给出修复动作（如 `docpath install --force` 或 `docpath update --reset-protocols`）。
- [ ] AC-3: 有回归测试钉住：故意让仓库 AGENTS.md 缺模板新增的某正文句 → 检测命中标为 drift；仓库协议含非 {{PROJECT_NAME}} 的有意定制 → 不误报或按配置豁免。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-462 与任务 T-20261001-install-r-460-block 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
