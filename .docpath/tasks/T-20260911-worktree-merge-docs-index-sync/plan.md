## 执行计划

### S1: 梳理并发开发收口 FR-1~FR-5 实现边界
- [x] S1: 梳理并发开发收口 FR-1~FR-5 实现边界
- **描述**: 按 spec 明确各 FR 的实现位置与验收口径。
- **验收条件**: spec 已含 5 FR + 6 AC + 4.1 Decision Brief
- **依赖**: 无

### S2: 实现 FR-1 worktree merge 预检收窄 + --allow-dirty-main
- [x] S2: 实现 FR-1 worktree merge 预检收窄 + --allow-dirty-main
- **描述**: worktree.ts merge 流程——计算合并将触碰的文件集（merge-base..branch 变更 ∪ checkout 副作用），与 dirty 交集非空才拒绝；零交集降级 warning 列文件；--allow-dirty-main <reason> 记录 breadcrumb 证据跳过交集拒绝。
- **验收条件**: AC-1
- **依赖**: S1

### S3: 实现 FR-2+FR-3 docs-index 合并治理与幂等生成
- [x] S3: 实现 FR-2+FR-3 docs-index 合并治理与幂等生成
- **描述**: merge-driver 支持 docs-index.json/docs.md（take-current + regenerate 提示）；.gitattributes 补条目；生成点去除扫描时间戳使字节幂等。
- **验收条件**: AC-2, AC-3
- **依赖**: S2

### S4: 实现 FR-4 版本漂移防护
- [x] S4: 实现 FR-4 版本漂移防护
- **描述**: doctor/next --agent 检测执行二进制与 repo 本地构建（dist/index.js 或 bin）不一致时 warning + `node dist/index.js` 指引。
- **验收条件**: AC-4
- **依赖**: S2

### S5: 实现 FR-5 worktree list --agent + sync
- [x] S5: 实现 FR-5 worktree list --agent + sync
- **描述**: list --agent 聚合输出各树 task/phase/merged_to_main/建议动作；sync 命令将 main 合入所有未完成 worktree（跳过 dirty 冲突树并报告）。
- **验收条件**: AC-5
- **依赖**: S2

### S6: 验证与收口
- [x] S6: 验证与收口
- **描述**: 全量 typecheck/test/check/review；dogfooding——用本任务的 FR-1 改进版 merge 完成 worktree 合回（主仓有另一会话 dirty 文件场景）。
- **验收条件**: AC-6
- **依赖**: S3,S4,S5

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5
- [x] S6

## 依赖关系图
S1 → S2 → S3 → S4 → S5 → S6
