# T-20260912-agent-write-plan-accept-dirty-commit-che - Agent 失败处理与验证去重协议 + write-plan accept-dirty / commit 口径 / check 命令清单

> backlog_id: R-347
> backlog_source: docpath backlog add

## 1. 背景与动机

# Agent 失败处理与验证去重协议 + 三处引擎缝隙 开发前分析

- 协议文本（templates/protocols/AGENTS.md「Lightweighting & Token Economy Rules」下新增第 4 条「Failure Handling & Verification Dedup」）：① 环境级失败（权限/沙箱/分类器不可用、命令被拒）连续两次后停止重试直接汇报；② `docpath check` / `docpath done` 已跑过的 typecheck/test/build 不要在前后再手动跑一遍；③ 改文件优先用编辑工具而非脚本改写，避免整文件回显。同步到本仓库根 AGENTS.md。
- 引擎 A：`write-plan` 补 `--accept-dirty <reason>`，与 `go` 同语义（记录 breadcrumb 证据后跳过 dirty guard）。
- 引擎 B：`commit --stage` 的 git-safety「重要未跟踪文件」拦截与 `changes --agent` 口径统一：若未跟踪源码文件已出现在 changes report 的 source/tests 组（即将被 stage），不再视为不安全。
- 引擎 C：`check` 通过时输出实际执行的外部命令清单（CheckResult 加可选 `command` 字段，printCheckReport 汇总行列出）。
- 范围：templates/protocols/AGENTS.md、AGENTS.md、src/commands/write-plan.ts、src/commands/register/spec.ts、src/utils/git-safety.ts、src/commands/commit.ts、src/commands/check/{types,runners,formatters}.ts、tests/。

- 用户：所有用 DocPath 的 agent 与维护者。dsh-plugin-docpath 一次会话实测：环境故障期间重试 10+ 次、check 前后重复验证、脚本改文件触发整文件回显，三者合计占该会话约 1/3 开销；三处引擎缝隙各让 agent 多绕一步。

- 无 UI。CLI 输出新增一段「执行的命令」列表（仅 check 通过且存在外部命令时）。

- S1 协议文本 + 根 AGENTS.md 同步 + install manifest 刷新。
- S2 write-plan --accept-dirty：register 加 option；writePlanCommand 在 assertCleanWorktreeForNewTask 前判断 acceptDirty，有则写 breadcrumb（context `write-plan --accept-dirty: <reason>`）并跳过；测试：dirty 下无旗标失败、有旗标成功且 breadcrumb 落盘。
- S3 git-safety：checkGitSafety 增加可选 `stagingCandidates: string[]`，commit 命令先 buildChangesReport 取 groups 平铺后传入；importantFiles 过滤掉候选集内文件。测试：untracked src 文件出现在 changes 组时 commit --stage 不再拒绝。
- S4 check 命令清单：runCheck 返回值加 `command: cmd`（去掉尾部 ` 2>&1`）；printCheckReport 在 allPassed 时打印「已执行命令」列表；evidence 写入 last-check 的 checks[] 也带 command。测试：check 输出含命令行。
- S5 build + 全量 test；check → review → journal；commit。

- R1：协议模板变更触发所有下游项目 install drift → 属预期，drift 提示本身就是回灌信号。
- R2：git-safety 放宽可能让真正孤儿文件被 stage → 只放宽出现在 changes report 分组内的文件，报告本身已按任务归属过滤。
- R3：CheckResult 新字段影响 last-check.json 消费方 → 字段可选，dsh-plugin-docpath 的 loader 宽容解析。

- 无阻塞。

## 1.1 已有证据

### 深度分析摘要 (analysis)

dsh-plugin-docpath 会话复盘（见正文）


## 2. 需求清单

### 功能需求
- [ ] FR-1: Agent 失败处理与验证去重协议 + write-plan accept-dirty / commit 口径 / check 命令清单
  - 来源 backlog: R-347

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- Agent 失败处理与验证去重协议 + write-plan accept-dirty / commit 口径 / check 命令清单

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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: Agent 失败处理与验证去重协议 + write-plan accept-dirty / commit 口径 / check 命令清单
- 目标: Agent 失败处理与验证去重协议 + write-plan accept-dirty / commit 口径 / check 命令清单
- 背景: 来自 backlog R-347
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户 2026-09-12：同意，可以在 docpath 仓库改

## 5. 验收标准

- [ ] AC-1: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-2: backlog 条目 R-347 与任务 T-20260912-agent-write-plan-accept-dirty-commit-che 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
