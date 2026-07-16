## 执行计划

### S1: 梳理 `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。
- [x] S1: 梳理 `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。
- **描述**: 根据 spec 明确 FR-1: `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。 的实现边界和验收口径。
- **验收条件**: AC-1: 修改已有非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，自动刷新 docs-index 且不输出 `docs-index 可能陈旧`。
- **依赖**: 无

### S2: 实现 `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。
- [x] S2: 实现 `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。
- **描述**: 在现有架构内完成 FR-1: `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。 的代码与文档更新。
- **验收条件**: FR-1 `docpath check` 检测 docs-index stale 时自动刷新 `.docpath/docs-index.json` 和人类视图 `.docpath/docs.md`。 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 实现 FR-2 自动刷新成功后不再输出 `docs-index 可能陈旧` warning，而是输出明确的通过项说明已刷新。
- [x] S3: 实现 FR-2 自动刷新成功后不再输出 `docs-index 可能陈旧` warning，而是输出明确的通过项说明已刷新。
- **描述**: 在现有架构内完成 FR-2: 自动刷新成功后不再输出 `docs-index 可能陈旧` warning，而是输出明确的通过项说明已刷新。。
- **验收条件**: FR-2 已实现，并保持现有工作流兼容。
- **依赖**: S2

### S4: 实现 FR-3 自动刷新失败时保留 warning，并继续给出 `docpath docs scan` 手动修复建议。
- [x] S4: 实现 FR-3 自动刷新失败时保留 warning，并继续给出 `docpath docs scan` 手动修复建议。
- **描述**: 在现有架构内完成 FR-3: 自动刷新失败时保留 warning，并继续给出 `docpath docs scan` 手动修复建议。。
- **验收条件**: FR-3 已实现，并保持现有工作流兼容。
- **依赖**: S3

### S5: 实现 FR-4 `docpath docs scan` CLI 继续保持原有输出行为，索引构建逻辑复用同一 helper，避免 check/docs scan 两套扫描实现漂移。
- [x] S5: 实现 FR-4 `docpath docs scan` CLI 继续保持原有输出行为，索引构建逻辑复用同一 helper，避免 check/docs scan 两套扫描实现漂移。
- **描述**: 在现有架构内完成 FR-4: `docpath docs scan` CLI 继续保持原有输出行为，索引构建逻辑复用同一 helper，避免 check/docs scan 两套扫描实现漂移。。
- **验收条件**: FR-4 已实现，并保持现有工作流兼容。
- **依赖**: S4

### S6: 验证验收标准
- [x] S6: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 修改已有非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，自动刷新 docs-index 且不输出 `docs-index 可能陈旧`。；AC-2: 新增非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，新文件进入 `.docpath/docs-index.json` 且不输出 stale warning。；AC-3: `docpath docs scan` 行为保持兼容，仍能生成 docs-index 和 docs.md。；AC-4: 目标测试、typecheck、DocPath check/review 通过，或明确记录非阻塞环境限制。
- **验收条件**: AC-1: 修改已有非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，自动刷新 docs-index 且不输出 `docs-index 可能陈旧`。；AC-2: 新增非忽略 Markdown 后运行 `docpath check --skip-tests --skip-lint`，新文件进入 `.docpath/docs-index.json` 且不输出 stale warning。；AC-3: `docpath docs scan` 行为保持兼容，仍能生成 docs-index 和 docs.md。；AC-4: 目标测试、typecheck、DocPath check/review 通过，或明确记录非阻塞环境限制。
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
