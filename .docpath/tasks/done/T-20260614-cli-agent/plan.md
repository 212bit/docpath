## 执行计划

### S1: 梳理 Phase 1 - 建立 CLI-only 基线
- **描述**: 根据 spec 明确 Phase 1 - 建立 CLI-only 基线 的实现边界和验收口径。
- **验收条件**: CLAUDE.md 和 skills 不再引用 `current.md` / `breadcrumb.md`，Agent 通过 CLI 读取状态
- **依赖**: 无

### S2: 实现 Phase 1 - 建立 CLI-only 基线
- **描述**: 在现有架构内完成 Phase 1 - 建立 CLI-only 基线 的代码与文档更新。
- **验收条件**: Phase 1 - 建立 CLI-only 基线 已实现，并保持现有工作流兼容。
- **依赖**: S1

## Checklist
- [x] S1
- [x] S2

## 依赖关系图
S1 → S2
