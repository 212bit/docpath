## 执行计划

### S1: 梳理现有 project-intake 路由与产物模型
- [x] S1: 梳理现有 project-intake 路由与产物模型
- **描述**: 阅读 `src/engine/project-intake.ts`、`src/commands/project.ts`、`src/utils/agent-output.ts`、`docs/design/project-intake-*` 与现有 `tests/project-command.test.mjs`，确认当前 capture/analyze/brief/backlog 的状态、next_hint 与测试覆盖。
- **验收条件**: 明确最小改动点：哪些输出需要新增需求梳理阶段说明，哪些测试需要覆盖，哪些协议文档需要同步。
- **依赖**: 无

### S2: 固化需求梳理流程契约与 CLI/Agent 路由
- [x] S2: 固化需求梳理流程契约与 CLI/Agent 路由
- **描述**: 在 project-intake 相关实现中固化 requirements-shaping 流程：raw materials -> domain analysis -> gap index -> stakeholder questions -> decision cards -> requirements approval -> backlog guidance，并确保未确认前不推荐直接创建 executable backlog。
- **验收条件**: `docpath project ...` 或 `docpath next --agent` 的相关输出能给出确定下一步；现有 capture/analyze/brief/backlog 行为保持兼容。
- **依赖**: S1

### S3: 同步协议和用户文档
- [x] S3: 同步协议和用户文档
- **描述**: 更新 AGENTS/CLAUDE/OPENCODE 协议和 getting-started/project-intake 设计文档，明确需求讨论阶段必须走 intake 流程，每阶段输出物与禁止事项清晰。
- **验收条件**: 文档中有统一的需求梳理流水线、阶段产物、拍板门和 backlog guidance 边界，不再只描述泛泛 project intake。
- **依赖**: S2

### S4: 补齐测试与质量门禁
- [ ] S4: 补齐测试与质量门禁
- **描述**: 增加或更新 project intake/next 路由测试，覆盖需求梳理提示、未拍板不生成开发 backlog、backlog guidance 仍需用户确认等行为，并运行相关测试和 DocPath gates。
- **验收条件**: 相关测试通过；`docpath check` 和 `docpath review` 通过或记录明确非阻塞原因。
- **依赖**: S2, S3

## Checklist
- [x] S1
- [x] S2
- [ ] S3
- [ ] S4

## 依赖关系图
S1 → S2 → S3 → S4
