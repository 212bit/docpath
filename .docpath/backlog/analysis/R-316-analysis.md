# R-316 待裁决大块收敛: project intake 平行工作流 / learn 与 lesson_summary 耦合 / config 命令归属

## 1. 分析与裁决结论

### 1.1 `project` Intake 工作流 (816 LOC, 0 调用)
- **分析**：全生命周期 0 次调用，与标准 `backlog promote → spec → plan` 主路径功能重叠，造成双轨认知负担。
- **裁决**：**彻底下线**。移除 `src/commands/project.ts`、`src/commands/register/project.ts`、`src/engine/project-intake.ts`，并清理 `AGENTS.md` 中的 intake 协议说明。

### 1.2 `learn` 命令及 `lesson_summary` 链路 (547 LOC, 1 调用)
- **分析**：命令极少调用，但 `formatters.ts` 会读取 `lesson-candidates.md` 并在 `next --agent` 中判定 `learnRequired`，导致 Agent 遇到空转推荐。
- **裁决**：**安全下线并解耦**。移除 `learn` 命令，联动摘除 `formatters.ts` 的 `lesson_summary` 与 `learnRequired` 路由，清理无消费的数据链路。

### 1.3 `config` 命令 (264 LOC, 0 调用)
- **分析**：命令层零使用，所有配置已收敛至 `.docpath/config.yaml` 集中管理。
- **裁决**：**移除 CLI 冗余入口**。移除 `config` 命令，保持配置文件为唯一配置入口。

## 2. 影响范围
- 命令注册：`src/commands/register.ts` 及对应的 `src/commands/register/{project,learn,config}.ts`
- 命令实现：`src/commands/{project,learn,config}.ts`
- 引擎实现：`src/engine/project-intake.ts`
- Agent 格式化输出：`src/utils/agent-output/formatters.ts`
- 协议文档与校验：`AGENTS.md` 及相关测试用例
