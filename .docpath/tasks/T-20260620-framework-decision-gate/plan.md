## 执行计划

### S1: 梳理 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。
- [x] S1: 梳理 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。
- **描述**: 根据 spec 明确 FR-1: 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。 的实现边界和验收口径。
- **验收条件**: AC-1: required UI 任务在缺 `frontend-stack.md` 或缺被否决备选/理由时,`docpath go` 被拦截并给出明确指引。
- **依赖**: 无

### S2: 实现 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。
- [x] S2: 实现 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。
- **描述**: 在现有架构内完成 FR-1: 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。 的代码与文档更新。
- **验收条件**: FR-1 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 `ui-gate.ts` 新增 `missingFrameworkDecision`，go 前置硬门禁中排在 design-preview / design-approval **之前**。校验：选定栈 JS 项非占位；至少 1 个被否决备选且带理由。
- [x] S3: 实现 FR-2 `ui-gate.ts` 新增 `missingFrameworkDecision`，go 前置硬门禁中排在 design-preview / design-approval **之前**。校验：选定栈 JS 项非占位；至少 1 个被否决备选且带理由。
- **描述**: 在现有架构内完成 FR-2: `ui-gate.ts` 新增 `missingFrameworkDecision`，go 前置硬门禁中排在 design-preview / design-approval **之前**。校验：选定栈 JS 项非占位；至少 1 个被否决备选且带理由。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `go.ts` 接入 framework-decision 门禁，required 任务缺决策时拦截并给出明确指引。
- [x] S4: 实现 FR-3 `go.ts` 接入 framework-decision 门禁，required 任务缺决策时拦截并给出明确指引。
- **描述**: 在现有架构内完成 FR-3: `go.ts` 接入 framework-decision 门禁，required 任务缺决策时拦截并给出明确指引。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 `write-design` 支持 `--kind stack`，把 framework-decision 内容落盘为 `frontend-stack.md`。
- [x] S5: 实现 FR-4 `write-design` 支持 `--kind stack`，把 framework-decision 内容落盘为 `frontend-stack.md`。
- **描述**: 在现有架构内完成 FR-4: `write-design` 支持 `--kind stack`，把 framework-decision 内容落盘为 `frontend-stack.md`。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 改写 `docpath-design` skill：将 Framework Decision 列为序列第一步，新增框架讨论提问清单（是否需要框架/JS选型/CSS方案/组件库/纯静态），并在选定后提示加载对应框架 skill（不内置框架 skill）。
- [ ] S6: 实现 FR-5 改写 `docpath-design` skill：将 Framework Decision 列为序列第一步，新增框架讨论提问清单（是否需要框架/JS选型/CSS方案/组件库/纯静态），并在选定后提示加载对应框架 skill（不内置框架 skill）。
- **描述**: 在现有架构内完成 FR-5: 改写 `docpath-design` skill：将 Framework Decision 列为序列第一步，新增框架讨论提问清单（是否需要框架/JS选型/CSS方案/组件库/纯静态），并在选定后提示加载对应框架 skill（不内置框架 skill）。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 实现 FR-6 纯静态(无框架)是合法选定，但同样强制写"为什么不用框架"作为被否决备选。
- [ ] S7: 实现 FR-6 纯静态(无框架)是合法选定，但同样强制写"为什么不用框架"作为被否决备选。
- **描述**: 在现有架构内完成 FR-6: 纯静态(无框架)是合法选定，但同样强制写"为什么不用框架"作为被否决备选。。
- **验收条件**: FR-6 已实现，并保持现有工作流兼容。
- **依赖**: S6

### S8: 验证验收标准
- [ ] S8: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: required UI 任务在缺 `frontend-stack.md` 或缺被否决备选/理由时,`docpath go` 被拦截并给出明确指引。；AC-2: `frontend-stack.md` 含完整选定栈+≥1被否决备选+理由时,framework-decision 门禁放行,序列推进到 design-preview。；AC-3: 纯静态选定但缺被否决备选时仍被拦截;补上"为什么不用框架"后放行。；AC-4: spec 4.1 exempt 任务不触发 framework-decision 门禁。；AC-5: `docpath-design` skill 以 Framework Decision 为序列首步,含框架讨论提问清单与加载提示。；AC-6: `pnpm test` 全绿,含新增 framework-decision 用例;`docpath check` 通过。
- **验收条件**: AC-1: required UI 任务在缺 `frontend-stack.md` 或缺被否决备选/理由时,`docpath go` 被拦截并给出明确指引。；AC-2: `frontend-stack.md` 含完整选定栈+≥1被否决备选+理由时,framework-decision 门禁放行,序列推进到 design-preview。；AC-3: 纯静态选定但缺被否决备选时仍被拦截;补上"为什么不用框架"后放行。；AC-4: spec 4.1 exempt 任务不触发 framework-decision 门禁。；AC-5: `docpath-design` skill 以 Framework Decision 为序列首步,含框架讨论提问清单与加载提示。；AC-6: `pnpm test` 全绿,含新增 framework-decision 用例;`docpath check` 通过。
- **依赖**: S7

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [ ] S5
- [ ] S6
- [ ] S7
- [ ] S8

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8
