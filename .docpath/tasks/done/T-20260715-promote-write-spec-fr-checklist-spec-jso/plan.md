## 执行计划

### S1: 梳理 `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。
- [x] S1: 梳理 `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。
- **描述**: 根据 spec 明确 FR-1: `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。 的实现边界和验收口径。
- **验收条件**: AC-1: backlog body 含 `- [ ] FR-N: ...` checklist 时，promote 后的 `spec.json.functional_requirements` 包含全部 checklist FR，而不是单条 title FR。
- **依赖**: 无

### S2: 实现 `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。
- [x] S2: 实现 `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。
- **描述**: 在现有架构内完成 FR-1: `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。 的代码与文档更新。
- **验收条件**: FR-1 `renderPromotedSpec` 在 backlog body 存在 checklist 形式 `FR-N` 条目时，使用这些条目生成 spec 的 `### 功能需求` checklist，并让 promoted `spec.json.functional_requirements` 包含全部 FR。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 backlog body 不存在可解析 FR checklist 时，保持现有回退行为：生成单条 `FR-1`，内容为 backlog title，并保留 backlog 来源说明。
- [x] S3: 实现 FR-2 backlog body 不存在可解析 FR checklist 时，保持现有回退行为：生成单条 `FR-1`，内容为 backlog title，并保留 backlog 来源说明。
- **描述**: 在现有架构内完成 FR-2: backlog body 不存在可解析 FR checklist 时，保持现有回退行为：生成单条 `FR-1`，内容为 backlog title，并保留 backlog 来源说明。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `docpath backlog promote` 输出必须显式提示 spec truth sync 语义：如果需要细化 FR/AC，应使用 `docpath write-spec --stdin`；直接手改 `spec.md` 不更新 `spec.json` 真源。
- [x] S4: 实现 FR-3 `docpath backlog promote` 输出必须显式提示 spec truth sync 语义：如果需要细化 FR/AC，应使用 `docpath write-spec --stdin`；直接手改 `spec.md` 不更新 `spec.json` 真源。
- **描述**: 在现有架构内完成 FR-3: `docpath backlog promote` 输出必须显式提示 spec truth sync 语义：如果需要细化 FR/AC，应使用 `docpath write-spec --stdin`；直接手改 `spec.md` 不更新 `spec.json` 真源。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 `docpath next --agent` 在 promote 后的 drafting 阶段也应暴露同等 truth sync hint，帮助后续 agent 在 plan 前使用正确入口修订 spec。
- [x] S5: 实现 FR-4 `docpath next --agent` 在 promote 后的 drafting 阶段也应暴露同等 truth sync hint，帮助后续 agent 在 plan 前使用正确入口修订 spec。
- **描述**: 在现有架构内完成 FR-4: `docpath next --agent` 在 promote 后的 drafting 阶段也应暴露同等 truth sync hint，帮助后续 agent 在 plan 前使用正确入口修订 spec。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 实现 FR-5 DocPath 使用文档补充 spec truth sync 说明，明确 `spec.json` 是结构化真源，`write-spec` 是同步入口，直接编辑 `spec.md` 不会更新真源。
- [x] S6: 实现 FR-5 DocPath 使用文档补充 spec truth sync 说明，明确 `spec.json` 是结构化真源，`write-spec` 是同步入口，直接编辑 `spec.md` 不会更新真源。
- **描述**: 在现有架构内完成 FR-5: DocPath 使用文档补充 spec truth sync 说明，明确 `spec.json` 是结构化真源，`write-spec` 是同步入口，直接编辑 `spec.md` 不会更新真源。。
- **验收条件**: FR-5 已实现，并保持现有工作流兼容。
- **依赖**: S5

### S7: 验证验收标准
- [x] S7: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: backlog body 含 `- [ ] FR-N: ...` checklist 时，promote 后的 `spec.json.functional_requirements` 包含全部 checklist FR，而不是单条 title FR。；AC-2: backlog body 不含 FR checklist 时，promote 行为保持兼容，仍生成 title fallback FR。；AC-3: `docpath backlog promote` 输出包含 truth sync hint，并指向 `docpath write-spec --stdin`。；AC-4: promote 后 `docpath next --agent` drafting hint 包含 truth sync 语义或等价上下文。；AC-5: 文档补充 spec truth sync 语义：`write-spec` 同步 `spec.json`，直接手改 `spec.md` 不更新真源。；AC-6: 新增/更新回归测试覆盖 R-260/R-262 类似 checklist backlog 场景。；AC-7: `docpath check`、`docpath review`、`docpath journal` 通过后，变更可提交。
- **验收条件**: AC-1: backlog body 含 `- [ ] FR-N: ...` checklist 时，promote 后的 `spec.json.functional_requirements` 包含全部 checklist FR，而不是单条 title FR。；AC-2: backlog body 不含 FR checklist 时，promote 行为保持兼容，仍生成 title fallback FR。；AC-3: `docpath backlog promote` 输出包含 truth sync hint，并指向 `docpath write-spec --stdin`。；AC-4: promote 后 `docpath next --agent` drafting hint 包含 truth sync 语义或等价上下文。；AC-5: 文档补充 spec truth sync 语义：`write-spec` 同步 `spec.json`，直接手改 `spec.md` 不更新真源。；AC-6: 新增/更新回归测试覆盖 R-260/R-262 类似 checklist backlog 场景。；AC-7: `docpath check`、`docpath review`、`docpath journal` 通过后，变更可提交。
- **依赖**: S6

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6
- [x] S7

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6 → S7
