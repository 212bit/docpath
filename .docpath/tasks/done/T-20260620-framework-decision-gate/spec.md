# T-20260620-framework-decision-gate - 前端技术栈决策门禁 (Framework Decision Gate)

> backlog_id: R-222

## 1. 背景与动机

DocPath 现有 UI 设计序列为：
`UI Prompt Brief → External Design Handoff → Design Preview → Design Approval → Implementation → Visual Acceptance`。

该序列从 Brief 直接跳到"找外部工具出 Design Preview"，**缺少"先定前端技术栈 → 充分讨论 → 再画图"的前置环节**。结果是门禁逼出了视觉稿，但稿子之前没有框架决策和充分设计讨论——这是 Dashboard 多次重设计仍不符合预期的根因。

本任务在序列最前插入一道硬门禁 `Framework Decision`，强制"选定栈 + ≥1 被否决备选 + 理由"先落痕，并由 `docpath-design` skill 组织框架讨论。门禁兜底"决策落了痕且带备选理由"，讨论深度由 skill 的提问清单组织。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新增产物模板 `frontend-stack.md`，结构含「选定栈(JS/CSS/组件库)」「被否决备选(≥1,带理由)」「约束」「待加载 skill」。
- [ ] FR-2: `ui-gate.ts` 新增 `missingFrameworkDecision`，go 前置硬门禁中排在 design-preview / design-approval **之前**。校验：选定栈 JS 项非占位；至少 1 个被否决备选且带理由。
- [ ] FR-3: `go.ts` 接入 framework-decision 门禁，required 任务缺决策时拦截并给出明确指引。
- [ ] FR-4: `write-design` 支持 `--kind stack`，把 framework-decision 内容落盘为 `frontend-stack.md`。
- [ ] FR-5: 改写 `docpath-design` skill：将 Framework Decision 列为序列第一步，新增框架讨论提问清单（是否需要框架/JS选型/CSS方案/组件库/纯静态），并在选定后提示加载对应框架 skill（不内置框架 skill）。
- [ ] FR-6: 纯静态(无框架)是合法选定，但同样强制写"为什么不用框架"作为被否决备选。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容；老的已完成 UI 任务不受影响。
- [ ] NFR-2: 增量 UI 任务不被惩罚——允许写"沿用既定栈 X,理由:一致性"+"重写为其他栈—理由:成本不划算",门禁仍通过。
- [ ] NFR-3: spec 4.1 声明 exempt(不涉及产品 UI)的任务,framework-decision 门禁不触发。

## 3. 范围界定

### 包含
- `frontend-stack.md` 模板 + `write-design --kind stack` 落盘。
- `ui-gate.ts` framework-decision 判定 + `go.ts` 接入。
- `docpath-design` skill 改写(序列首步 + 提问清单 + 加载提示)。
- 配套测试扩展(ui-gate / go-ui-gate)。

### 不包含
- 不内置任何框架专属 skill(react/vue/tailwind 等),只做"决策记录 + 加载提示"。
- 不改 DocPath 自身的 Dashboard UI。
- 不引入对讨论"深度"的自动度量(门禁只校验决策落痕 + 备选理由)。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 框架决策位置/强度 | 软提示 / 硬门禁-最前置 / 插在 preview 后 | 硬门禁-最前置 | 框架选型必须先于画图,否则视觉稿无技术落点 |
| 2 | 防"填名走过场" | 仅校验字段非空 / 必须带≥1被否决备选+理由 | 备选+理由 | 逼出"为什么不选别的",对齐核心不满(讨论不充分) |
| 3 | 框架 skill 形态 | 内置一批框架 skill / 只做决策记录+加载提示 | 决策记录+加载提示 | 代码改动轻,重头在 skill 内容;不背内置维护成本 |
| 4 | 纯静态是否免备选 | 免 / 同样强制写被否决备选 | 强制 | "为什么不用框架"本身就是该记录的决策 |
| 5 | 增量 UI 任务 | 同等强制重选 / 允许沿用既定栈 | 允许沿用 | 避免每个小 UI 改动重开选型,惩罚增量 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

> 说明：本任务构建的是"治理产品 UI 的工作流门禁",自身不实现任何产品 UI,故 exempt。

### Decision Brief
- 当前问题: UI 设计序列缺"先定技术栈→充分讨论→再画图"前置环节,门禁逼出视觉稿但讨论不充分(Dashboard 反复不符预期的根因)。
- 目标: 在序列最前插入 Framework Decision 硬门禁,强制选定栈+≥1被否决备选+理由,并由 docpath-design skill 组织框架讨论。
- 可选方案: (A)只加字段门禁;(B)门禁+备选理由+skill 提问清单(选定);(C)内置全套框架 skill。
- 推荐方案: B — 门禁兜底决策落痕,skill 组织讨论深度,不内置框架 skill。
- 不做什么: 不内置框架 skill;不改 Dashboard;不自动度量讨论深度。
- 成本: 中等。代码改动轻(ui-gate/go/write-design),重头在 skill 内容与测试。
- 风险: 门禁只能保证决策落痕+备选理由,无法保证讨论深度(接受的现实,由 skill 兜底)。
- 回滚方案: 回滚本任务提交;门禁为 required 任务新增,exempt 路径不变,不影响存量。
- 用户确认: 已确认(含 A=纯静态强制写被否决备选; B=先收口旧任务)。

## 5. 验收标准

- [ ] AC-1: required UI 任务在缺 `frontend-stack.md` 或缺被否决备选/理由时,`docpath go` 被拦截并给出明确指引。
- [ ] AC-2: `frontend-stack.md` 含完整选定栈+≥1被否决备选+理由时,framework-decision 门禁放行,序列推进到 design-preview。
- [ ] AC-3: 纯静态选定但缺被否决备选时仍被拦截;补上"为什么不用框架"后放行。
- [ ] AC-4: spec 4.1 exempt 任务不触发 framework-decision 门禁。
- [ ] AC-5: `docpath-design` skill 以 Framework Decision 为序列首步,含框架讨论提问清单与加载提示。
- [ ] AC-6: `pnpm test` 全绿,含新增 framework-decision 用例;`docpath check` 通过。
