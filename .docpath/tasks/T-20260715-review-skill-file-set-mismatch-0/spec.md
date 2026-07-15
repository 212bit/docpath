# T-20260715-review-skill-file-set-mismatch-0 - review-skill file set mismatch 阻塞正常代码（0 错误仍被卡）

> backlog_id: R-255
> backlog_source: docpath backlog capture

## 1. 背景与动机

[来源: docpath 项目现场，R-251 修复过程中复现] `docpath review` 在代码本身 0 错误 0 警告（current_diff 与 baseline 均干净）时，仍因 Review Skill Gate 报 `invalid_evidence: file set mismatch` 阻塞，必须用 `--skip-skill-review <skill> --reason <reason>` 手动豁免才能通过。

代码核实：`src/utils/review-skill-router.ts` 的 `validateEvidenceForRequirement` 在 `evidence.files` 与 `requirement.files` 不完全一致时返回 `file set mismatch`，随后 `evaluateReviewSkillGate` 将其纳入 `invalid_evidence` 并把 gate 判为 fail。这个问题的语义是 review skill evidence 的元数据范围已过期或不匹配，不等同于代码缺陷。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `review` 检测到 review skill `file set mismatch` 时，输出明确的 evidence 重生成指引，包含对应 `docpath write-review-skill --skill ... --stdin` 命令。
- [ ] FR-2: 仅由 `file set mismatch` 造成的 review skill evidence 元数据问题不再强制阻塞 review；代码 0 错误时 review 可通过。
- [ ] FR-3: 保留其他 review skill gate 阻塞语义：missing evidence、missing skill source、diff fingerprint mismatch、status fail、pass evidence 含 error finding 仍应阻塞。

### 非功能需求
- [ ] NFR-1: 保持现有 `review_skill_gate.status` 枚举兼容，不新增破坏性状态；新增输出字段必须 append-only。
- [ ] NFR-2: 不实现 `--fix-skill-evidence` 自动重建；本任务只提供明确修复提示和非阻塞降级。

## 3. 范围界定

### 包含
- `src/utils/review-skill-router.ts` 中 `file set mismatch` 的 recoverable evidence warning 分流。
- `src/commands/review.ts` 中 `evidence_warnings` 的 CLI 输出。
- 回归测试覆盖 file set mismatch 不再阻塞且输出重生成命令。

### 不包含
- 自动生成/修复 review skill evidence。
- 改变 `write-review-skill` 对输入 file set 的严格校验。
- 改变 diff fingerprint mismatch、missing evidence 或 failed evidence 的阻塞行为。
- 合并或依赖 R-254 的重复 skip 参数修复。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | file set mismatch 语义 | 继续阻塞 / 降级为 warning / 自动修复 evidence | 降级为 warning | 它是 evidence 元数据范围问题，不是代码缺陷；warning 能给 agent 明确下一步且不误拦正常代码。 |
| 2 | 输出契约 | 新增 gate status / 复用 pass 并追加字段 | 复用现有 status，追加 `evidence_warnings` | 避免破坏现有 status 消费方，保持 append-only。 |
| 3 | 自动修复 | 实现 `--fix-skill-evidence` / 只提示 write command | 只提示 write command | 自动修复需要生成语义 evidence，当前 CLI 不调用 hidden LLM，不应伪造 review evidence。 |

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

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: Review Skill Gate 把 `file set mismatch` 这类 evidence 元数据范围不匹配当作硬阻塞，导致代码 0 错误时 review 仍失败。
- 目标: 将 file set mismatch 转为可恢复 warning，提示重生成 evidence，同时不放松真实缺陷或缺失 evidence 的阻塞语义。
- 背景: R-255 来自 DocPath 自身 review 收尾摩擦；用户在 2026-07-15 同意继续处理该 backlog。
- 可选方案: A. 继续要求手动 skip；B. 降级为 warning 并提示 write-review-skill；C. 实现自动修复 evidence。
- 推荐方案: B。
- 决策理由: B 解决误拦并保持 CLI 不伪造语义 review evidence；C 需要 agent/LLM 生成 evidence，不适合当前 CLI 自动化边界。
- 不做什么: 不改变 missing evidence、missing skill source、diff fingerprint mismatch 或 status fail 的阻塞语义；不实现 `--fix-skill-evidence`。
- 成本: 小，集中在 review-skill-router 评估结果和 review 输出。
- 风险: 部分消费者可能只看 `status=pass` 而忽略 warning；通过 append-only `evidence_warnings` 和 CLI 明示 fix command 降低风险。
- 回滚方案: 回退本任务提交，恢复 file set mismatch 进入 invalid_evidence 的行为。
- 用户确认: 用户在 2026-07-15 对继续处理 R-255 明确回复“同意”。

## 5. 验收标准

- [ ] AC-1: review 检测到 file set mismatch 时输出 `evidence_warnings` 和对应 `docpath write-review-skill --skill ... --stdin` 修复命令。
- [ ] AC-2: 代码 0 错误且仅有 file set mismatch 时，review 不再被 Review Skill Gate 强制阻塞。
- [ ] AC-3: diff fingerprint mismatch、missing evidence、status fail 等现有阻塞测试不回归。
- [ ] AC-4: `review_skill_gate` JSON evidence 中保留 append-only `evidence_warnings`，现有 status 枚举不变。
- [ ] AC-5: targeted review-skill-router tests、typecheck、DocPath check/review 通过。
