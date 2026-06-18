# T-20260606-docpath-backlog-task-workspace-spec - 梳理 DocPath 信息架构并降低 backlog/task/workspace/spec 重叠

> backlog_id: R-090
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- 当前 DocPath 同时存在 backlog、tasks、workspace、`.docpath/spec` 等目录，职责本身合理，但命名和输出容易让用户误以为有多套需求真源。
- `.docpath/spec/style.md` 与 `.docpath/tasks/current/spec.md` 都叫 spec，前者实际是全局规则，后者才是任务需求，认知冲突最大。
- `current.md` 是 state.json 的渲染产物，但协议模板中仍有“更新 current.md checklist”等表述，会误导 Agent 手工编辑运行态文件。
- backlog promote 生成骨架 spec 时常出现“待补充”，next/plan 应更明确引导先补 spec，而不是让空 spec 顺滑进入泛化计划。

## 验收

- 文档和协议中明确 backlog/tasks/workspace/rules 的职责边界。
- 新项目初始化生成 `.docpath/rules/style.md` 和 `.docpath/rules/architecture.md`，并兼容旧 `.docpath/spec/*`。
- CLI 读取全局规则时优先使用 `.docpath/rules`，旧路径作为 fallback。
- `current.md` 在模板和输出中明确为渲染产物，不作为任务真源。
- promote/next 对包含“待补充”的骨架 spec 给出补全引导。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 引入 `.docpath/rules` 作为全局规则目录，并保留 `.docpath/spec` 兼容读取
- [ ] FR-2: 更新 context/reveal/learn/agent-output 等读取全局规则的路径与文案
- [ ] FR-3: 更新 init/install 模板与协议文案，明确 backlog/tasks/workspace/rules 职责
- [ ] FR-4: current.md 文案明确其为 state.json 渲染产物，不要求手工勾选 checklist
- [ ] FR-5: next --agent 在检测到当前 spec 含“待补充”时推荐补全 spec，而不是直接进入 plan/go

### 非功能需求
- [ ] NFR-1: 保持旧 `.docpath/spec/style.md`、`.docpath/spec/architecture.md` 项目可用
- [ ] NFR-2: 不迁移历史 done 任务，不重写历史决策日志
- [ ] NFR-3: 全量测试、check、review 保持通过

## 3. 范围界定

### 包含
- `.docpath/rules` 新路径的初始化、模板安装和读取兼容
- 协议模板、状态输出和 next 路由文案调整
- 针对 rules fallback、init 目录、next 空 spec 引导的测试

### 不包含
- 删除 `.docpath/spec` 历史目录
- 批量迁移 `.docpath/tasks/done` 中的历史文本
- 重构 backlog/task/workspace 的持久化模型

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 全局规则目录命名 | spec / rules / policies | rules | 避免和任务 spec 混淆，含义直接 |
| 2 | 迁移方式 | 直接重命名 / 兼容双读 | 兼容双读 | 降低已有项目破坏风险 |
| 3 | 空 spec 路由 | 允许 plan / 引导补 spec | 引导补 spec | 避免泛化计划和返工 |

## 5. 验收标准

- [ ] AC-1: `docpath init` 新建 `.docpath/rules/style.md` 与 `.docpath/rules/architecture.md`
- [ ] AC-2: 只有旧 `.docpath/spec` 的项目，learn/context/reveal/next 仍能读取规则
- [ ] AC-3: 模板 AGENTS/CLAUDE/CODEX 文案使用 rules 表达全局规范，并说明 current.md 是渲染产物
- [ ] AC-4: 当前任务 spec 含“待补充”时，`next --agent` 推荐补全 spec，并在 required_files 中包含 current spec
- [ ] AC-5: 全量 `pnpm test`、`docpath check`、`docpath review` 通过

---

*此文件由 `docpath backlog promote` 生成，并在任务启动时补齐需求细节。*
