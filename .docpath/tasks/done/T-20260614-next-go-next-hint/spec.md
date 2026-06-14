# T-20260614-next-go-next-hint - 前置重大变更门禁、明确 next/go 边界并统一 next_hint 输出

> backlog_id: R-177
> backlog_source: docpath backlog capture

## 1. 背景与动机

DocPath 已将 agent 启动协议从 `status --agent` + `next --agent` 双命令收敛为 `next --agent` 单入口。复盘后发现三个继续优化点：

- R-B: 重大变更门禁不能只在 `check` 阶段后置发现，应在 `next`/`plan`/`go`/`agent enter` 前置阻断。
- R-A: `next --agent` 应定位为只读路由器和恢复入口，不应成为所有显式原子命令的强制前置。
- R-C: state-changing commands 成功后应输出统一 `next_hint`，减少 agent 机械重复运行 `next --agent`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: R-B：将重大变更门禁前置到 `next --agent`、`plan`、`go --step`、`agent enter`
  - 如果当前任务涉及 workflow/agent behavior 等重大变更，且 spec 未完成 Decision Brief 和用户确认，执行前应 fail loud 或 route 到 spec/refine。
- [ ] FR-2: R-A：明确 `next --agent` 是 read-only advisory router，不是所有 deterministic commands 的硬性前置
  - agent protocol 必须说明 start/resume 或 state uncertain 时运行 `next --agent`；用户显式指定 `go/check/review/changes` 等确定命令时可以直接执行，由命令自行校验。
- [ ] FR-3: R-C：核心 state-changing commands 成功后输出统一 `next_hint`
  - `plan`、`go`、`agent step`、`check`、`review`、`journal`、`backlog promote` 等命令成功后提供结构化下一步提示。
- [ ] FR-4: 保持现有命令和 YAML 输出兼容
  - 不删除 `status --agent`；不破坏现有测试中解析的 `recommended_command`。

### 非功能需求
- [ ] NFR-1: 新门禁必须 fail loud，并给出具体修复命令或 spec 字段位置。
- [ ] NFR-2: 多 session 场景下，state-changing commands 自行重新读取状态，不依赖之前的 `next` 输出。
- [ ] NFR-3: 测试覆盖新增门禁、协议文档和 next_hint 输出。

## 3. 范围界定

### 包含
- 新增或复用重大变更 gate 检测逻辑，并前置到 route/execution commands。
- 更新 agent protocol、skills、templates 和 docs，使 `next` 的 advisory 定位清晰。
- 给核心 state-changing commands 输出统一 `next_hint`。
- 添加 targeted tests，并运行全量测试与 DocPath gates。

### 不包含
- 删除、重命名或弱化 `docpath status --agent`。
- 将 `next --agent` 改成 state-changing 或持锁命令。
- 全面重构所有命令输出格式为 JSON/YAML-only。
- 改变 install target/current_agent 的语义。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | R-B 前置位置 | 只在 check / next 提示 / plan-go-agent enter 都拦 | plan/go/agent enter 都拦，next 路由提示 | write commands 必须自校验，next 只能作为建议，安全边界要在 state-changing commands 内 |
| 2 | R-A next 定位 | 强制前置 / advisory router | advisory router | 避免重复命令和 TOCTOU，显式原子命令应直接执行并自行校验 |
| 3 | R-C 输出形态 | 只改文本 / 统一 next_hint 文本块 / 破坏式 YAML 输出 | 统一非破坏式 next_hint 文本块 | 保持现有 CLI 输出兼容，同时给 agent 可解析的结构化提示 |

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
- 当前问题: `check` 能发现重大变更 Decision Brief 缺失，但发现时机太晚；`next` 的强制前置语义也容易让安全边界放错位置；state-changing commands 成功后没有统一 next_hint，导致 agent 重复运行 `next --agent`。
- 目标: 按 R-B、R-A、R-C 顺序完成：前置重大变更门禁；明确 `next` 是 advisory router、`go` 是 atomic step control；统一 state-changing commands 的 `next_hint` 输出。
- 背景: 用户复盘发现上轮 agent protocol 变更没有在开发前补 Decision Brief，并要求继续优化这些流程边界。
- 可选方案: 继续只靠 check 后置阻断；让 next 成为强制授权命令；或把校验下沉到各 state-changing commands 并保留 next 作为只读路由器。
- 推荐方案: `next` 负责只读 route 和恢复；`plan/go/agent enter` 等写命令执行前自行校验重大变更门禁；成功写命令输出统一 `next_hint`。
- 不做什么: 不删除 `status --agent`；不把 `next` 做成持锁/写状态命令；不破坏现有命令的人类可读输出。
- 成本: 需要改 runtime route、go/plan/agent 等命令、协议模板、测试，以及可能调整 review/check 期望。
- 风险: 过度拦截可能影响已有任务；通过 spec 结构化 gate 和 targeted tests 降低误报。
- 回滚方案: 回退新增前置 gate、协议文档和 next_hint 输出，保留现有 check 后置检查。
- 用户确认: 用户明确要求“同意，我需要你按顺序把 R-B，R-A，R-C 全部完成”。

## 5. 验收标准

- [ ] AC-1: R-B 完成：重大变更 spec 未确认时，`next --agent` 不推荐执行，`plan`/`go`/`agent enter` fail loud，并有测试覆盖。
- [ ] AC-2: R-A 完成：协议、skill、templates、docs 明确 `next --agent` 只在 start/resume/uncertain state 必跑，显式 deterministic commands 可直接执行且自行校验。
- [ ] AC-3: R-C 完成：核心 state-changing commands 成功后输出统一 `next_hint`，agent 可从命令输出获得下一步，不必机械重复 `next`。
- [ ] AC-4: `status --agent`、`next --agent`、现有 human output 保持向后兼容。
- [ ] AC-5: targeted tests、`pnpm test`、`docpath check`、`docpath review` 通过。

---

*此文件由 Codex 根据 R-177 和用户确认写入。*
