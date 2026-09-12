# T-20260912-agents-md-claude-codex - 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理

> backlog_id: R-341
> backlog_source: docpath backlog add

## 1. 背景与动机

当前 docpath install --target universal 会在项目根目录同时生成 AGENTS.md、CLAUDE.md、CODEX.md、OPENCODE.md 四个完整大文件（每个近 10KB），85% 以上内容重复。导致根目录污染、多协议加载下的 Token 翻倍浪费、以及规则变动时的跨端维护漂移地狱。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-341-analysis.md

## 2. 需求清单

### 功能需求
- [ ] FR-1: 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理
  - 来源 backlog: R-341

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理

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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 当前 docpath install --target universal 会在项目根目录同时生成 AGENTS.md、CLAUDE.md、CODEX.md、OPENCODE.md 四个完整大文件（每个近 10KB），85% 以上内容重复。导致根目录污染、多协议加载下的 Token 翻倍浪费、以及规则变动时的跨端维护漂移地狱。
- 目标: 协议文件单一真源与瘦客户端重构：确立 AGENTS.md 为唯一真源，CLAUDE/CODEX 降级为瘦代理
- 背景: 来自 backlog R-341
- 可选方案:
  - 方案 A: 确立 AGENTS.md 为全局唯一完备协议真源，CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行）指向 @AGENTS.md，更新 install/render 校验与测试
  - 方案 B: 维持多端全量大文件，依赖 protocol blocks 注入同步
- 推荐方案: 方案 A
- 决策理由: 彻底消除多端协议内容重复与维护漂移，大幅节约上下文 Token，同时兼容各端 CLI 原生调用
- 不做什么: 不废除 universal 目标，不改变 OpenCode 运行机制
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 旧版项目单独安装 claude 时需补齐 AGENTS.md 依赖（install 自动完成）
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户显式要求「完成 R-341」并授权执行单一真源与瘦客户端重构方案

## 5. 验收标准

- [ ] AC-1: 确立 AGENTS.md 为全局唯一完备协议真源；2. CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行），仅保留专属命令映射并显式指向 @AGENTS.md；3. 重构 templates/protocols 模板与 docpath install / render 校验逻辑；4. 全量测试与 install manifest 检查保持通过。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-341 与任务 T-20260912-agents-md-claude-codex 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
