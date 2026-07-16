# T-20260716-check-docs-scan-go - check docs-index dirty no longer blocks go

> backlog_id: R-270

## 1. 背景与动机
check 自动刷新 docs-index 产生脏文件曾阻断 go。实现已在 commit 2044874：`isCurrentTaskExecutionPath` 允许 docs-index.json/docs.md。

## 2. 需求清单
### 功能需求
- [x] FR-1: docs-index.json 与 docs.md 在 execution-start dirty guard 中视为 closeout-owned
- [x] FR-2: 非 DocPath 脏文件仍被阻断

### 非功能需求
- [x] NFR-1: 保持 R-249 对业务脏文件的严格门禁

## 3. 范围界定
### 包含
- dirty guard 路径白名单
### 不包含
- 改变 check 自动刷新策略本身

## 4.1 重大变更门禁
- [x] 否（行为扩展白名单，已实现并测试）
### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

### Decision Brief
- 用户确认: goal 完成剩余 backlog；实现已落地 2044874

## 5. 验收标准
- [x] AC-1: dirty docs-index/docs.md alone do not fail execution-start dirty guard
- [x] AC-2: non-DocPath dirty still blocked
- [x] AC-3: tests/dirty-worktree-guard.test.mjs coverage
