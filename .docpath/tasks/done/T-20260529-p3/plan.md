# Plan: Phase 3 — Agent Superpowers

> Task ID: T-20260529-p3
> Status: design_approved
> Created: 2026-05-29

## 阶段 1: TDD Skill 循环（Superpowers 借鉴）

**目标**: 实现 spec→plan→act→check→done 的 agent 纪律循环

**实现**:
1. 新增 `src/commands/tdd.ts`（或扩展现有命令）
2. 流程: `docpath tdd start` → 写 spec → 写 plan → act → `docpath check` → done
3. 在每个阶段自动校验前置条件（spec 存在才能 plan，plan 存在才能 act）
4. 集成到 CLI: `docpath tdd [start|status|next]`

**验收**:
- `docpath tdd start` 创建 spec 骨架
- `docpath tdd next` 推进到下一阶段
- 阶段不满足时提示前置条件

**修改文件**: 新增 `src/commands/tdd.ts`，修改 `src/cli.ts`

## 阶段 2: context-compaction（Trellis 借鉴）

**目标**: 当前上下文过长时，自动压缩为摘要，下次 agent 可恢复

**实现**:
1. 新增 `src/utils/compact.ts`
2. `compactContext(contextPath)` 读取当前 context，压缩为核心信息
3. 在 `docpath context` 中检测 token 数，超阈值时自动触发压缩
4. 压缩产物写入 `.docpath/workspace/compact-context.md`
5. `docpath context` 优先读取 compact 版本

**压缩策略**:
- 保留: state、next action、recent breadcrumbs（最后5条）、escalation
- 丢弃: 历史 breadcrumbs、旧 evidence 细节、已完成步骤

**验收**:
- context 超 8000 字符时自动压缩
- 压缩后 `docpath context` 输出 < 2000 字符
- 关键信息（state、next action）不丢失

**修改文件**: 新增 `src/utils/compact.ts`，修改 `src/commands/context.ts`

## 阶段 3: AI 纪律增强（Superpowers 借鉴）

**目标**: 在 go/check/journal 命令中嵌入 agent 行为校验

**实现**:
1. 新增 `src/utils/discipline.ts`
2. `preActionChecklist()` — go 前检查: state 是否允许、breadcrumb 是否有、是否有未完成 escalation
3. `continuationProtocol()` — context 输出末尾附加 "下一步建议" + "未完成项"
4. 集成到 go.ts: 执行前调用 preActionChecklist
5. 集成到 context.ts: 输出末尾调用 continuationProtocol

**验收**:
- `docpath go` 在 state 不匹配时拒绝并提示
- `docpath context` 输出末尾包含下一步建议
- escalation 未解决时 go 发出警告

**修改文件**: 新增 `src/utils/discipline.ts`，修改 `src/commands/go.ts`、`src/commands/context.ts`

## 阶段 4: Progressive Disclosure（Harness 借鉴）

**目标**: `docpath context` 只显示当前状态 + 下一步，不暴露全部历史

**实现**:
1. 修改 `src/commands/context.ts`
2. 默认模式: 仅输出 state + next action + recent breadcrumbs（最后3条）+ escalation
3. `--full` flag: 输出完整 context（含所有 breadcrumbs、所有 evidence）
4. `--level [minimal|standard|full]` 三级控制

**验收**:
- `docpath context` 默认输出 < 500 字符
- `docpath context --full` 输出完整信息
- `docpath context --level standard` 输出中等信息

**修改文件**: 修改 `src/commands/context.ts`

## 阶段 5: 可选归档（GSD 借鉴）

**目标**: `docpath journal` 归档行为可配置

**实现**:
1. 在 `.docpath/config.json` 中新增 `archiveOnJournal: boolean`（默认 false）
2. 修改 `src/commands/journal.ts` — 读取配置决定是否归档
3. 修改 `src/commands/config.ts` — 支持查看/修改此配置
4. `docpath journal --archive` 可临时覆盖配置

**验收**:
- 默认 `docpath journal` 不归档（当前行为）
- 设置 `archiveOnJournal: true` 后自动归档
- `--archive` flag 可临时覆盖

**修改文件**: 修改 `src/commands/journal.ts`、`src/commands/config.ts`

## 阶段 6: 验证 + 提交

**验收清单**:
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm build` 通过
- [ ] `docpath check` 通过
- [ ] TDD 循环 E2E 验证
- [ ] context-compaction E2E 验证
- [ ] AI 纪律增强 E2E 验证
- [ ] Progressive Disclosure E2E 验证
- [ ] 可选归档 E2E 验证

**提交策略**:
- 每阶段 1 个 commit
- 共 5 个 commit: `feat(p3): TDD skill / context-compaction / AI discipline / progressive disclosure / optional archive`
- 不 push（遵循 ga_update_sop）
