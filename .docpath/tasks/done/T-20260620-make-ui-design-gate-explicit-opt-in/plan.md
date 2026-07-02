## 执行计划

### S1: 梳理 resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。
- [x] S1: 梳理 resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。
- **描述**: 根据 spec 明确 FR-1: resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。 的实现边界和验收口径。
- **验收条件**: AC-1: 未显式声明的普通页面、布局、组件、dashboard、CSS 或前端实现任务不会返回 UI required，也不会阻塞 go/check。
- **依赖**: 无

### S2: 实现 resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。
- [x] S2: 实现 resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。
- **描述**: 在现有架构内完成 FR-1: resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。 的代码与文档更新。
- **验收条件**: FR-1 resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 unknown 状态不再因为 page、layout、component、dashboard、CSS、frontend implementation 等泛 UI 或前端关键词自动升级为 required。
- [x] S3: 实现 FR-2 unknown 状态不再因为 page、layout、component、dashboard、CSS、frontend implementation 等泛 UI 或前端关键词自动升级为 required。
- **描述**: 在现有架构内完成 FR-2: unknown 状态不再因为 page、layout、component、dashboard、CSS、frontend implementation 等泛 UI 或前端关键词自动升级为 required。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 显式设计意图仍可触发 required，包括 UI design、UX analysis、visual direction、prototype、Figma、v0、Stitch、Framer、design-preview、design approval、先设计、设计审批等。
- [x] S4: 实现 FR-3 显式设计意图仍可触发 required，包括 UI design、UX analysis、visual direction、prototype、Figma、v0、Stitch、Framer、design-preview、design approval、先设计、设计审批等。
- **描述**: 在现有架构内完成 FR-3: 显式设计意图仍可触发 required，包括 UI design、UX analysis、visual direction、prototype、Figma、v0、Stitch、Framer、design-preview、design approval、先设计、设计审批等。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 backlog promote 只在显式设计意图存在时勾选 UI required，普通前端或页面任务默认勾选 UI exempt。
- [x] S5: 实现 FR-4 backlog promote 只在显式设计意图存在时勾选 UI required，普通前端或页面任务默认勾选 UI exempt。
- **描述**: 在现有架构内完成 FR-4: backlog promote 只在显式设计意图存在时勾选 UI required，普通前端或页面任务默认勾选 UI exempt。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 unknown 命中 UI 或前端关键词时最多产生非阻塞 advisory，不导致 docpath go 或 docpath check 失败。
- [x] S6: 实现 FR-5 unknown 命中 UI 或前端关键词时最多产生非阻塞 advisory，不导致 docpath go 或 docpath check 失败。
- **描述**: 在现有架构内完成 FR-5: unknown 命中 UI 或前端关键词时最多产生非阻塞 advisory，不导致 docpath go 或 docpath check 失败。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 显式 required 时保持现有两级硬门禁：go 检查 frontend-stack、design-preview、approved design-approval 和 preview 深度；check 检查完整设计证据与视觉验收。
- [x] S7: 实现 FR-6 显式 required 时保持现有两级硬门禁：go 检查 frontend-stack、design-preview、approved design-approval 和 preview 深度；check 检查完整设计证据与视觉验收。
- **描述**: 在现有架构内完成 FR-6: 显式 required 时保持现有两级硬门禁：go 检查 frontend-stack、design-preview、approved design-approval 和 preview 深度；check 检查完整设计证据与视觉验收。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 实现 FR-7 write-design 继续作为 DocPath 设计证据写入器保留，不作为自动触发器。
- [x] S8: 实现 FR-7 write-design 继续作为 DocPath 设计证据写入器保留，不作为自动触发器。
- **描述**: 在现有架构内完成 FR-7: write-design 继续作为 DocPath 设计证据写入器保留，不作为自动触发器。。
- **验收条件**: FR-7 已实现，并保持现有工作流兼容。
- **依赖**: S7

### S9: 实现 FR-8 docpath-design skill 和模板文档改为显式 opt-in 语义。
- [x] S9: 实现 FR-8 docpath-design skill 和模板文档改为显式 opt-in 语义。
- **描述**: 在现有架构内完成 FR-8: docpath-design skill 和模板文档改为显式 opt-in 语义。。
- **验收条件**: FR-8 已实现，并保持现有工作流兼容。
- **依赖**: S8

### S10: 验证验收标准
- [x] S10: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 未显式声明的普通页面、布局、组件、dashboard、CSS 或前端实现任务不会返回 UI required，也不会阻塞 go/check。；AC-2: spec.json ui_gate required 和 spec.md 显式勾选 required 仍触发 go/check 硬门禁。；AC-3: spec.json 或 spec.md 显式 exempt 即使正文含 UI 关键词也继续豁免。；AC-4: backlog promote 对普通 UI/前端任务默认勾选不涉及产品 UI 实现。；AC-5: backlog promote 对显式设计意图任务勾选涉及产品 UI 实现。；AC-6: unknown UI/前端关键词最多产生非阻塞 advisory，命令退出码仍成功。；AC-7: 显式 required 缺 frontend-stack、design-preview 或 approved design-approval 时，go 仍 fail-loud。；AC-8: 显式 required 缺完整设计证据或视觉验收时，check 仍失败。；AC-9: docpath-design skill 与 templates/codex-skills/docpath-design/SKILL.md 明确写成显式 opt-in。；AC-10: 相关测试通过，至少覆盖 ui-gate、go-ui-gate、backlog-command、check-review 中受影响分支。
- **验收条件**: AC-1: 未显式声明的普通页面、布局、组件、dashboard、CSS 或前端实现任务不会返回 UI required，也不会阻塞 go/check。；AC-2: spec.json ui_gate required 和 spec.md 显式勾选 required 仍触发 go/check 硬门禁。；AC-3: spec.json 或 spec.md 显式 exempt 即使正文含 UI 关键词也继续豁免。；AC-4: backlog promote 对普通 UI/前端任务默认勾选不涉及产品 UI 实现。；AC-5: backlog promote 对显式设计意图任务勾选涉及产品 UI 实现。；AC-6: unknown UI/前端关键词最多产生非阻塞 advisory，命令退出码仍成功。；AC-7: 显式 required 缺 frontend-stack、design-preview 或 approved design-approval 时，go 仍 fail-loud。；AC-8: 显式 required 缺完整设计证据或视觉验收时，check 仍失败。；AC-9: docpath-design skill 与 templates/codex-skills/docpath-design/SKILL.md 明确写成显式 opt-in。；AC-10: 相关测试通过，至少覆盖 ui-gate、go-ui-gate、backlog-command、check-review 中受影响分支。
- **依赖**: S9

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7
- [x] S8
- [x] S9
- [ ] S10

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S10
