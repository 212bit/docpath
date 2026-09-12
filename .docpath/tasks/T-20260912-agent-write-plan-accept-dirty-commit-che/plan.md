## 执行计划

### S1: 协议文本第 4 条 + 根 AGENTS.md 同步
- [x] S1: 协议文本第 4 条 + 根 AGENTS.md 同步
- **描述**: templates/protocols/AGENTS.md Token Economy Rules 新增第 4 条；根 AGENTS.md 同步；install --check 通过。
- **验收条件**: AC-1。
- **依赖**: 无

### S2: write-plan --accept-dirty
- [x] S2: write-plan --accept-dirty
- **描述**: register/spec.ts 加 option；write-plan.ts 有旗标则写 breadcrumb 跳过 guard；tests/dirty-worktree-guard 补两用例。
- **验收条件**: AC-2。
- **依赖**: S1

### S3: commit 与 changes 口径统一
- [x] S3: commit 与 changes 口径统一
- **描述**: checkGitSafety 接受 stagingCandidates；commit.ts 先取 changes report 分组传入；tests/commit-injection 补正反用例。
- **验收条件**: AC-3。
- **依赖**: S2

### S4: check 命令清单
- [x] S4: check 命令清单
- **描述**: CheckResult/CheckEvidenceItem 加可选 command；runCheck 填充；printCheckReport 通过时打印清单；evidence 写入；tests/check-review 补断言。
- **验收条件**: AC-4。
- **依赖**: S3

### S5: 回归 + 门禁 + commit
- [x] S5: 回归 + 门禁 + commit
- **描述**: build + 全量 test；check → review → journal；commit。
- **验收条件**: AC-5。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
