# T-20260615-task - 技术债务清理 — 删除废弃文件和未使用依赖

> backlog_id: R-180
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

src/llm/client.ts 100 行废弃 stub 曾保留，src/utils/complexity.ts 和 src/utils/escalation.ts 曾被标记为疑似未使用，代码库还存在未使用导入和无引用本地 helper。当前实现中 src/llm 已不存在；complexity/escalation 的实际位置为 src/engine，并且被 continue 路由和 engine index 使用。

## 验收

删除或确认不存在 src/llm/client.ts；评估 complexity/escalation 的实际使用关系并保留仍在使用的 src/engine 实现；清理未使用的导入和无引用本地 helper；确认依赖仍被使用；pnpm build 通过；无废弃文件路径残留。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 清理废弃 LLM stub、旧路径残留、未使用导入和无引用本地 helper
  - 来源 backlog: R-180
- [ ] FR-2: 对 complexity/escalation 做实际引用评估，避免删除仍在使用的 engine 能力

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不删除仍被命令或公共 engine export 使用的能力

## 3. 范围界定

### 包含
- 删除或验证 src/llm/client.ts、src/utils/complexity.ts、src/utils/escalation.ts 等旧路径不存在
- 清理 TypeScript 未使用导入和无引用本地 helper
- 验证 package dependencies 仍有代码引用
- 运行 pnpm build、pnpm test 和严格 unused-symbol 检查作为验收证据

### 不包含
- 不删除仍被 src/commands/continue.ts 或 src/engine/index.ts 使用的 src/engine/complexity.ts、src/engine/escalation.ts
- 不调整产品 UI、CLI 命令语义、外部依赖版本或构建工具
- 不引入新的 lint 工具或 package 依赖

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | complexity/escalation 处理 | 删除疑似文件 / 保留实际使用的 engine 模块并清理死代码 | 保留 src/engine 模块 | 搜索确认 src/engine/complexity.ts 和 src/engine/escalation.ts 被 continue 和 engine index 使用，删除会破坏恢复升级逻辑 |
| 3 | unused cleanup 范围 | 只删 import / 同步删除无引用本地 helper | 同步删除无引用本地 helper | 严格 TypeScript unused 检查能机械验证，且 helper 无调用点 |

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
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [x] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: R-180 要求删除废弃文件和未使用依赖，但候选文件路径与当前代码树存在偏差；盲删会误删仍在使用的 engine 能力。
- 目标: 移除确认无引用的导入和本地 helper，确认旧 LLM/utils 路径无残留，同时保留 continue/escalation 仍依赖的 engine 模块。
- 背景: src/llm/client.ts、src/utils/complexity.ts、src/utils/escalation.ts 当前不存在；src/engine/complexity.ts 和 src/engine/escalation.ts 被 src/commands/continue.ts 与 src/engine/index.ts 使用。
- 可选方案: 1) 按 backlog 字面删除所有 complexity/escalation 文件；2) 仅删除确认无引用的代码并保留 live engine 模块；3) 推迟清理。
- 推荐方案: 采用方案 2，删除严格 unused 检查确认的导入和无引用 helper，不删除 live engine 模块。
- 不做什么: 不移除已被引用的 package dependencies，不改变 CLI 命令语义，不引入 lint/depcheck 新依赖。
- 成本: 小范围机械 TypeScript 清理，需重新运行 build/test/check/review。
- 风险: 删除过多会破坏 continue 的 escalation 评估；删除过少会留下技术债。通过引用搜索、严格 unused 检查和测试降低风险。
- 回滚方案: 回滚本任务提交即可恢复删除的导入/helper 和 DocPath evidence。
- 用户确认: 用户在 2026-06-15 明确要求 “complete R-180”，作为执行删除/清理类变更的确认。

## 5. 验收标准

- [ ] AC-1: src/llm/client.ts、src/utils/complexity.ts、src/utils/escalation.ts 不存在，且无旧路径引用
- [ ] AC-2: src/engine/complexity.ts 和 src/engine/escalation.ts 已评估为 live code 并保留
- [ ] AC-3: TypeScript strict unused-symbol 检查通过
- [ ] AC-4: pnpm build 通过
- [ ] AC-5: pnpm test 通过
- [ ] AC-6: backlog 条目 R-180 与任务 T-20260615-task 建立双向关联

---

*此文件由 `docpath backlog promote` 生成，并在 R-180 执行中补充 Decision Brief。*