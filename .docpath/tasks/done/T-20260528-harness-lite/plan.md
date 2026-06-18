# Plan: Harness Lite Phase 1

> Task ID: T-20260528-harness-lite
> Status: check_pass
> Created: 2026-05-29

## 阶段 1: 增强 check 命令的脚本发现能力

**目标**: 让 `docpath check` 能发现并运行 typecheck 相关脚本

**修改文件**: `src/commands/check.ts`

**当前状态** (已读取 463 行):
- ✅ 已检测 `npm run build` / `npm test` / `npm run lint`
- ✅ 已检测 Cargo.toml / go.mod
- ❌ 未检测 typecheck 相关脚本

**实现计划**:
1. 在 `package.json` 检测段添加 typecheck 脚本发现:
   - 优先级: `typecheck` > `type-check` > `tsc --noEmit` > `tsc -p tsconfig.json --noEmit`
2. 添加 `pnpm` / `yarn` 包管理器检测:
   - 检测 `pnpm-lock.yaml` → 使用 `pnpm run <script>`
   - 检测 `yarn.lock` → 使用 `yarn run <script>`
   - 检测 `package-lock.json` → 使用 `npm run <script>`

**验收标准**:
- `docpath check` 在当前 docpath 项目中能检测并运行 `pnpm typecheck`

## 阶段 2: 写入 last-check.md

**目标**: 将 check 结果持久化到 `.docpath/workspace/last-check.md`

**新增逻辑** (在 checkCommand 末尾):
1. 收集所有 `CheckResult` 数据
2. 生成 markdown 格式:
   ```markdown
   # Last Check

   > Timestamp: 2026-05-29T12:00:00Z
   > Status: PASS | FAIL
   > Duration: 1.2s

   ## Results

   | Check | Status | Summary |
   |-------|--------|---------|
   | 构建 | ✅ | ... |
   | 测试 | ✅ | ... |
   | Lint | ❌ | ... |

   ## Failed Details

   > Lint output snippet...
   ```
3. 写入 `.docpath/workspace/last-check.md`

**验收标准**:
- 运行 `docpath check` 后 `.docpath/workspace/last-check.md` 被创建/更新
- 失败的检查项有详细输出

## 阶段 3: context 命令展示 check 证据

**目标**: 让 `docpath context` 在输出中显示最近的 check 结果

**修改文件**: `src/commands/context.ts`

**实现计划**:
1. 读取 `.docpath/workspace/last-check.md` (如果存在)
2. 在 context 输出末尾追加:
   ```markdown
   ## 🔍 最近验证

   > 2026-05-29 12:00 | Status: PASS
   > 构建 ✅ | 测试 ✅ | Lint ❌
   ```

**验收标准**:
- `docpath context` 输出包含最近 check 摘要

## 阶段 4: 验证 + 提交

**验收清单**:
- [x] `pnpm typecheck` 通过
- [x] `pnpm build` 通过
- [x] `node dist/index.js check` 通过 (检测到 typecheck)
- [x] `.docpath/workspace/last-check.md` 被正确写入
- [x] `node dist/index.js context` 显示 check 证据

**提交策略**:
- 1 个 commit: `feat(harness-lite): add typecheck discovery, last-check.md, context evidence`
- 不 push (遵循 ga_update_sop)
