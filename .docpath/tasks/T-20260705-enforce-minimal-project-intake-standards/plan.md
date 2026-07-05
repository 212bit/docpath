## 执行计划

### S1: 固化 project-intake 交付包契约
- [x] S1: 固化 project-intake 交付包契约
- **描述**: 更新 project-intake dry-run payload 与 backlog guidance，明确必需三件套 requirements.md / architecture.md / development-checklist.md，可选 open-questions / decisions / style，并移除 phase-backlog.md 作为要求。
- **验收条件**: `project analyze --dry-run` 和 `project backlog --dry-run` 输出包含最小三件套、可选项与结构化 backlog 质量要求。
- **依赖**: 无

### S2: 增加项目标准冻结检查
- [x] S2: 增加项目标准冻结检查
- **描述**: 在 check 或 project 状态路径中识别项目级 standards package 是否缺失、是否仍为 draft/prototype/inferred 状态，并在开发前给出失败或警告。
- **验收条件**: 测试覆盖缺少必需文档、草稿标记、正常通过三种情形；不影响无 project-intake 的普通任务。
- **依赖**: S1

### S3: 更新协议与用户文档
- [ ] S3: 更新协议与用户文档
- **描述**: 更新 agent protocols 与设计文档，说明需求梳理完成后必需三件套和可选增强项，backlog 是结构化数据质量要求而非 phase-backlog.md 文件。
- **验收条件**: 文档中明确 agent 不得把推断当作已拍板规范，进入开发前需检查标准冻结状态。
- **依赖**: S1

### S4: 验证门禁并收口
- [ ] S4: 验证门禁并收口
- **描述**: 运行定向测试、typecheck、全量测试、docpath check/review，并按生命周期关闭任务。
- **验收条件**: 所有相关测试通过，`docpath check` 与 `docpath review` 通过，任务完成证据写入。
- **依赖**: S2, S3

## Checklist
- [x] S1
- [ ] S2
- [ ] S3
- [ ] S4

## 依赖关系图
S1 → S2 → S3 → S4
