# T-20260923-check-test-scope-quick-guard-porcelain-b - check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复

> backlog_id: R-362
> backlog_source: docpath backlog add

## 1. 背景与动机

check 全量测试约占耗时97%（实测80s），主要来自 node --test 87文件857用例。提供 --test-scope=touched 影响面减载（叶子改动省82%）与 --test-scope=full 受控并发+进程隔离；修复 quick-guard readChangedFiles 对 tracked 文件 porcelain 输出 slice(3) 路径错切的核心漏判 bug。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/R362-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复
  - 来源 backlog: R-362

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复

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
- 当前问题: check 全量测试约占耗时97%（实测80s），主要来自 node --test 87文件857用例。提供 --test-scope=touched 影响面减载（叶子改动省82%）与 --test-scope=full 受控并发+进程隔离；修复 quick-guard readChangedFiles 对 tracked 文件 porcelain 输出 slice(3) 路径错切的核心漏判 bug。
- 目标: check 测试执行优化包：--test-scope 影响面减载、受控并发与进程隔离、quick-guard porcelain 路径 bug 修复
- 背景: 来自 backlog R-362
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

- [ ] AC-1: --test-scope=touched 仅运行与 git 改动相关的测试子集，叶子改动（改单个非核心源文件）实测减载不低于 80%；AC-2: touched 触及 RISKY_PATH_PATTERNS（命令主文件、check/worktree 子模块、engine、核心 utils、package.json、锁文件、tsconfig）时强制回落全量，不漏测核心；AC-3: --test-scope=full（默认）注入受控并发 --test-concurrency（cpu/2，范围 2 到 8）与 --test-isolation=process，全量覆盖不筛选；AC-4: quick-guard readChangedFiles 对 tracked 修改（状态码前导空格的 M src/...）用 line.slice(3) 正确取路径，核心路径不致被错切为 rc/... 而漏判；AC-5: 受控并发加进程隔离消除全并发摊薄与 ~/.docpath/projects.sqlite 竞态重试，整体 check 墙钟显著下降（基线约 80s）；AC-6: 上述行为均有回归测试覆盖。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-362 与任务 T-20260923-check-test-scope-quick-guard-porcelain-b 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
