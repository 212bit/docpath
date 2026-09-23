# T-20260923-next-executing-agent-enter-go-step - next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）

> backlog_id: R-364
> backlog_source: docpath backlog add

## 1. 背景与动机

`next` / `next_hint` 在「phase=executing 且 plan 有未完成步骤」时推荐 `docpath agent enter`，但 `agent enter` 的定位是**一次性会话入口**（`src/commands/agent.ts:5-6`：「加载 state.json 标记执行开始」），不是可反复执行的「下一步」。

复现（2026-09-23，隔离 git 工作区，phase=executing + plan 两个未完成步骤）：

```
$ docpath next --agent
next_action: 开始或恢复任务执行，运行 agent enter 初始化会话
recommended_command: docpath agent enter
exit_criteria: 已运行 docpath agent enter 并生成 pending-done 哨兵

$ docpath agent enter
...
next_hint:
  next_action: "执行下一个未完成步骤: S1 todo（检测到 pending-done 哨兵，完成当前步骤后再收尾）"
  recommended_command: docpath go --step S1
```

矛盾有三：

1. **路由不可稳定复现**：`agent enter` 的 `exit_criteria` 是「已生成 pending-done 哨兵」；一旦哨兵生成，`next` 就跳到 pending-done 分支、不再推荐 enter。即该推荐最多只该出现一次，却以「下一步」的形式常驻。
2. **推荐的不是真正要执行的动作**：真正推进任务的是 `docpath go --step <id>`。`agent enter` 只是会话初始化，执行后仍需再走 go——用户多一次往返。
3. **代码自身自相矛盾**：`src/commands/agent.ts:231` 的报错文案写「正常路径: 先运行上方 recommended_command，**通常是 `docpath go --step <id>`**」，而该分支实际推荐的是 `agent enter`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）
  - 来源 backlog: R-364

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）

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
- 当前问题: `next` / `next_hint` 在「phase=executing 且 plan 有未完成步骤」时推荐 `docpath agent enter`，但 `agent enter` 的定位是**一次性会话入口**（`src/commands/agent.ts:5-6`：「加载 state.json 标记执行开始」），不是可反复执行的「下一步」。
- 目标: next 在 executing 期误推 agent enter（应直接推荐 go --step 下一步）
- 背景: 来自 backlog R-364
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

- [ ] AC-1: `phase=executing` 且 plan 存在未完成步骤时，`next` / `next_hint` 的 `recommended_command` 为 `docpath go --step <下一个未完成步骤 id>`，不再是 `docpath agent enter`；
- [ ] AC-2: `docpath agent enter` 命令本身保留（仍作为会话入口：加载状态、生成 context-index、写 pending-done 哨兵），只是不再作为 `next` 的常规下一步推荐；
- [ ] AC-3: 无 plan / 无法解析未完成步骤时仍给出可操作降级（不得退化为推荐一个不可执行的命令）；
- [ ] AC-4: quick profile / troubleshooting / 有 pending-done 哨兵等既有分支语义不变；
- [ ] AC-5: 回归测试覆盖：executing + 未完成步骤 → 推荐 `go --step <id>`；并确认既有 `agent enter` 相关测试（agent-lifecycle / major-change-gate / payload-context-index）不受影响。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-364 与任务 T-20260923-next-executing-agent-enter-go-step 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
