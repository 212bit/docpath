## 执行计划

### S1: 抽出共享 UI 门禁判定模块
- **描述**: 新建 src/utils/ui-gate.ts，导出 resolveUiDesignRequirement(cwd) 返回 'required'|'exempt'|'unknown'（spec 4.1 显式框优先，未勾选时回退到关键词检测），以及 missingDesignArtifacts(cwd) 检查 design-preview.md 存在性与 design-approval.md 是否 approved。逻辑从 check.ts 现有的 isUiUxTaskText/isUiUxWorkflowOnlyTask/approvalState 提炼，保证单一真源。
- **验收条件**: ui-gate.ts 编译通过；resolveUiDesignRequirement 对「勾选涉及UI」「勾选不涉及」「未勾选+命中关键词」「未勾选+无关键词」四种输入分别返回 required/exempt/required(回退)/unknown。
- **依赖**: 无

### S2: spec 模板新增 UI 设计门禁显式框
- **描述**: 在 templates/spec.template.md 的 ## 4.1 重大变更门禁 区块内新增「### UI 设计门禁」子区块，含两个互斥复选框：不涉及产品 UI 实现（豁免）/ 涉及产品 UI 实现（go 前须有 preview+approved approval）。
- **验收条件**: 模板含新子区块；resolveUiDesignRequirement 能正确解析勾选状态。
- **依赖**: S1

### S3: go 前置硬门禁
- **描述**: 在 goCommand 的 resolveBoundTaskId 之后、startStep 之前插入设计门禁：若 resolveUiDesignRequirement 为 required 且 missingDesignArtifacts 非空 → fail-loud 拒绝进入执行；dry-run 与 exempt/unknown(未命中关键词) 放行。不新增绕过 flag，合法豁免走 spec 的「不涉及」框。
- **验收条件**: go 在 required+缺产物时非零退出并提示 write-design；exempt 与 dry-run 正常放行。
- **依赖**: S1

### S4: check 改用共享逻辑，显式框优先
- **描述**: 重构 check.ts 的 UI gate，调用 ui-gate.ts 的共享判定取代内联的 isUiUxWorkflowOnlyTask 措辞自证；显式框优先于关键词，行为与 go 一致。
- **验收条件**: docpath check 对 required 缺产物仍 FAIL；对 exempt 显式豁免 PASS（不再靠措辞）；既有 check-review 测试不回归。
- **依赖**: S1

### S5: 回归测试与门禁验证
- **描述**: 新增 tests 覆盖 go 设计门禁（required拦截/exempt放行/unknown关键词回退/dry-run不受影响）与 ui-gate 单元判定；运行 build+typecheck+全量测试+自测 docpath check。
- **验收条件**: 新测试通过；pnpm test 全绿；docpath check 自测 PASS。
- **依赖**: S2, S3, S4
