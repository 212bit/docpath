## 执行计划

### S1: 梳理 R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md
- [x] S1: 梳理 R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md
- **描述**: 根据 spec 明确 FR-1: R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md 的实现边界和验收口径。
- **验收条件**: AC-1: AC-1: 全仓 grep "via symlink"/"Live-shared"/"option C" 在协议模板/已装副本零命中 (docs 契约历史小节警告性提及除外)。
- **依赖**: 无

### S2: 实现 R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md
- [x] S2: 实现 R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md
- **描述**: 在现有架构内完成 FR-1: R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md 的代码与文档更新。
- **验收条件**: FR-1 R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: AC-1: 全仓 grep "via symlink"/"Live-shared"/"option C" 在协议模板/已装副本零命中 (docs 契约历史小节警告性提及除外)。；AC-2: AC-2: install --check 通过; next/status 的 install_health passed=true, errors=0。；AC-3: AC-3: 重装前后本地 CLAUDE.md 内容 byte-identical。；AC-4: AC-4: pnpm test 全绿 (install.test.mjs 回归)。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-277 与任务 T-20260716-r-273-p0-symlink-install-claude-md 建立双向关联
- **验收条件**: AC-1: AC-1: 全仓 grep "via symlink"/"Live-shared"/"option C" 在协议模板/已装副本零命中 (docs 契约历史小节警告性提及除外)。；AC-2: AC-2: install --check 通过; next/status 的 install_health passed=true, errors=0。；AC-3: AC-3: 重装前后本地 CLAUDE.md 内容 byte-identical。；AC-4: AC-4: pnpm test 全绿 (install.test.mjs 回归)。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-277 与任务 T-20260716-r-273-p0-symlink-install-claude-md 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
