# T-20260610-ui-gate-hard-constraint - UI 设计门禁硬约束化

## 1. 背景与动机

当前 DocPath 的 UI/UX 设计门禁只在 `docpath check`（实现之后）触发，且依赖正则猜测任务是否为 UI 任务。实测发现 5 条绕过路径，其中最严重两条：

- **事后才拦（时序 #4）**：`go`/`agent enter` 进入执行前对 UI 设计零感知，写完代码才在 check 被拦，为时已晚。
- **提交即失明（#1）**：`productUiChangedFiles` 只看 `git status` 未提交 diff，UI 代码一旦 commit 即检测不到。
- 关键词假阴性（#2）、措辞自证豁免（#3）。

本任务把门禁从「事后软门禁」升级为「事前硬约束 + 声明式契约」。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新建 `src/utils/ui-gate.ts`，提供 `resolveUiDesignRequirement(cwd)`（returns required|exempt|unknown，显式框优先、关键词回退）与 `missingDesignArtifacts(cwd)`（检查 design-preview.md 存在 + design-approval.md state=approved），供 go 与 check 共用
- [ ] FR-2: `templates/spec.template.md` 的 `## 4.1 重大变更门禁` 新增「UI 设计门禁」子区块，含「涉及/不涉及产品 UI 实现」两个显式复选框
- [ ] FR-3: `goCommand` 在 resolveBoundTaskId 之后、startStep 之前插入硬门禁：当 requirement=required 且缺 design-preview 或 approval 非 approved 时 fail-loud 拒绝进入执行；requirement=unknown 时仅关键词命中才拦，否则放行；dry-run 不受影响
- [ ] FR-4: `check.ts` 的 UI gate 改用共享判定，显式框优先于关键词，exempt 直接豁免（取代脆弱的 isUiUxWorkflowOnlyTask 措辞自证）

### 非功能需求
- [ ] NFR-1: 向后兼容——老 spec（无显式框）落入 unknown，行为与现状一致（关键词回退），零误伤
- [ ] NFR-2: go 与 check 共用同一份判定逻辑，杜绝两处标准漂移

## 3. 范围界定

### 包含
- ui-gate.ts 共享逻辑、spec 模板字段、go 事前门禁、check 改用共享逻辑、回归测试

### 不包含
- 路由层 agent-output.ts route 到 write-design（另一增强，避免范围膨胀）
- 完整 git diff HEAD~N 提交窗检测（方案 C，后续）
- 实际产品 UI 代码、页面重构、视觉实现

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | unknown 任务处理 | 一律拦 / 关键词命中才拦 | 关键词命中才拦 | 老任务零误伤，显式框管新任务 |
| 2 | go 卡哪一档产物 | 仅 preview / preview+approved approval | preview+approved approval | 对齐 docpath-design 硬规则，卡住「用户批准具体方案」 |
| 3 | 是否给 go 加绕过 flag | 加 --force / 不加 | 不加 | 合法豁免走 spec「不涉及」框，可审计，不留静默后门 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 是，需要用户确认

### 变更类型
- [x] 工作流 / Agent 行为
- [x] check gate / 门禁逻辑

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: UI 设计门禁可被 5 条路径绕过，事后才拦、依赖正则
- 目标: 事前硬约束 + 声明式契约
- 推荐方案: A(go 前移)+B(spec 显式框优先)，共享 ui-gate.ts
- 不做什么: 路由层增强、git diff 提交窗检测、产品 UI 代码
- 风险: 误伤老任务（已用 unknown→关键词回退化解）
- 回滚方案: 单 commit，revert 即可
- 用户确认: 已确认（A+B，unknown 关键词回退，go 卡 preview+approval）

## 5. 验收标准

- [ ] AC-1: go 在 required+缺产物时 fail-loud；exempt 放行；unknown 走关键词回退；dry-run 不受影响
- [ ] AC-2: check 与 go 共用 ui-gate.ts，显式框优先于关键词，build+typecheck 通过，回归测试齐全
