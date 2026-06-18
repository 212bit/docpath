# T-20260602-task-2 - 清理明确冗余目录和运行态备份文件

> backlog_id: R-079
> backlog_source: docpath backlog add

## 1. 背景与动机

- 上一轮评估发现仓库存在空目录、运行态备份文件和疑似历史测试夹具。
- 本轮只清理证据明确的冗余项，避免误删仍可能作为模板、协议或测试夹具使用的资产。
- `e2e-test/` 与 `temp-test/` 虽然当前引用较少，但属于被 Git 跟踪的示例/夹具目录，需另起任务确认后再处理。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 删除空目录 `src/templates/`；确认 `.codex/` 无文件、无 Git 跟踪内容，若本地权限阻止删除则不作为仓库清理项。
  - 来源 backlog: R-079
- [ ] FR-2: 删除被 Git 跟踪的运行态备份文件 `.docpath/workspace/current.md.bak`。
- [ ] FR-3: 记录但不删除 `e2e-test/`、`temp-test/`，避免在缺少明确产品决策时移除夹具资产。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 清理后 `pnpm test` 与 `docpath check` 必须通过。

## 3. 范围界定

### 包含
- 空目录清理。
- 明确备份文件清理。
- 清理范围说明。

### 不包含
- 删除或迁移 `e2e-test/`、`temp-test/`。
- 大规模调整 `.gitignore`。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 清理策略 | 只删证据明确项 | 采用 | 夹具目录可能承载示例或手工 E2E 语义，贸然删除风险较高 |

## 5. 验收标准

- [ ] AC-1: `src/templates/` 不再存在，`.codex/` 无文件且无 Git 跟踪内容。
- [ ] AC-2: `.docpath/workspace/current.md.bak` 不再被 Git 跟踪。
- [ ] AC-3: `pnpm test` 通过。
- [ ] AC-4: `docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
