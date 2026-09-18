# T-20260912-path - 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异

> backlog_id: R-332
> backlog_source: docpath backlog capture

## 1. 背景与动机

本机 PATH 的 docpath 为全局旧安装（~/.npm-global），本仓库开发必须 node bin/docpath.js；开发者在仓库目录误用全局旧版时无任何提示，新功能验证易踩旧行为。方向：(a) bin 入口（仓库 checkout 内启动时）检测 PATH docpath 版本差并在 doctor/next 输出提示；(b) 或提供 npm link/落 shim 的引导；(c) 文档明示双轨事实。

## 1.1 已有证据

### 需求澄清历史 (brainstorm)

2026-09-12 会话 brainstorm dry-run：方案 a+c；b（npm link 自动化）因写全局环境超出免确认边界排除；warn 走 install --doctor 全量输出 + next --agent nag-once advisory

### 深度分析摘要 (analysis)

会话分析定稿：挂载点=install-core.checkGlobalVersionDrift→buildInstallDoctorReportFromContext issues（warn 级，errors 才 flip passed 故不污染 doctor 退出码）；next 可见性经 agent-output.ts:186 install_health（compact 仅 passed，故用 formatters 内 R-287 式 nag-once console.warn，同版本对不重复）；检测门=package.json name==docpath + bin/docpath.js 存在 + PATH which realpath 回溯 package.json 版本差，三场景（非本仓/无全局/版本一致）短路零噪音；排除 b（npm link 写全局）


## 2. 需求清单

### 功能需求
- [ ] FR-1: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
  - 来源 backlog: R-332

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异

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
- 当前问题: 本机 PATH 的 docpath 为全局旧安装（~/.npm-global），本仓库开发必须 node bin/docpath.js；开发者在仓库目录误用全局旧版时无任何提示，新功能验证易踩旧行为。方向：(a) bin 入口（仓库 checkout 内启动时）检测 PATH docpath 版本差并在 doctor/next 输出提示；(b) 或提供 npm link/落 shim 的引导；(c) 文档明示双轨事实。
- 目标: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
- 背景: 来自 backlog R-332
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

- [ ] AC-1: 1) install-core 新增 checkGlobalVersionDrift（warn 级）：docpath 源码 checkout 内 PATH docpath 版本与仓库 package.json 版本不一致时产出 global-version-drift issue，install --doctor 可见；2) next --agent 首次检测到新漂移状态给一行 advisory 提示（nag-once，同版本对不重复），指明 node bin/docpath.js 正确调用；3) getting-started 补双轨说明；4) 非 docpath 项目/无全局安装/版本一致三种场景零噪音；5) 回归测试锁定
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-332 与任务 T-20260912-path 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
