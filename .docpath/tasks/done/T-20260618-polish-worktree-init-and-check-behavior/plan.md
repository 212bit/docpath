## 执行计划

### S1: 梳理 Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails.
- **描述**: 根据 spec 明确 FR-1: Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails. 的实现边界和验收口径。
- **验收条件**: AC-1: Existing `.docpath/` 项目 runtime repair 成功但 registry DB 只读时，`docpath init` exit 0 并输出 warning。
- **依赖**: 无

### S2: 实现 Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails.
- **描述**: 在现有架构内完成 FR-1: Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails. 的代码与文档更新。
- **验收条件**: FR-1 Existing-project `docpath init` must keep runtime repair successful even when project registry registration fails. 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 Existing-project `docpath init` must report registry registration failure as a warning with actionable context instead of exiting nonzero after repair.
- **描述**: 在现有架构内完成 FR-2: Existing-project `docpath init` must report registry registration failure as a warning with actionable context instead of exiting nonzero after repair.。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 `docpath check` must discover a main-checkout `node_modules/.bin` when running from a linked Git worktree without local dependencies.
- **描述**: 在现有架构内完成 FR-3: `docpath check` must discover a main-checkout `node_modules/.bin` when running from a linked Git worktree without local dependencies.。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 Check subprocesses must receive the enhanced `PATH` consistently for typecheck, build, lint, and test commands.
- **描述**: 在现有架构内完成 FR-4: Check subprocesses must receive the enhanced `PATH` consistently for typecheck, build, lint, and test commands.。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: Existing `.docpath/` 项目 runtime repair 成功但 registry DB 只读时，`docpath init` exit 0 并输出 warning。；AC-2: Existing `.docpath/` 项目 registry 可写时仍正常注册。；AC-3: `docpath check` 从 Git worktree 运行时，可使用 main checkout 的 `node_modules/.bin` 找到 `tsc` / `tsup`。；AC-4: Typecheck/build/test subprocesses 都使用增强后的 PATH。；AC-5: 回归测试覆盖 registry warning 和 worktree check PATH augmentation。
- **验收条件**: AC-1: Existing `.docpath/` 项目 runtime repair 成功但 registry DB 只读时，`docpath init` exit 0 并输出 warning。；AC-2: Existing `.docpath/` 项目 registry 可写时仍正常注册。；AC-3: `docpath check` 从 Git worktree 运行时，可使用 main checkout 的 `node_modules/.bin` 找到 `tsc` / `tsup`。；AC-4: Typecheck/build/test subprocesses 都使用增强后的 PATH。；AC-5: 回归测试覆盖 registry warning 和 worktree check PATH augmentation。
- **依赖**: S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
