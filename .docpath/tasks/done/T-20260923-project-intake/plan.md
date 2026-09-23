## 执行计划

### S1: 实现并验证 文档治理：清理 project-intake 下线残留与文档扫描盲区
- [x] S1: 实现并验证 文档治理：清理 project-intake 下线残留与文档扫描盲区
- **描述**: 完成 FR-1: 文档治理：清理 project-intake 下线残留与文档扫描盲区，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: AC-1：`REVIEW-project-intake.md`、`FIX-project-intake-concurrency.md`、；AC-2: `COMPLETION-project-intake-security-fix.md` 已从仓库移除。；AC-3: AC-2：`docs/getting-started.md` 中不再出现 `docpath project` 命令示例；保留的文档约定；AC-4: 描述准确；含指向 2026-09-08 下线事实的历史说明。；AC-5: AC-3：`docs/design/project-document-placement.md` 存在且只含通用放置决策，；AC-6: 不含 intake 专属内容；`project-intake-artifact-model.md` 与 `project-intake-command-contract.md`；AC-7: 已删除；`docs/README.md` 索引已同步更新为新文档。；AC-8: AC-4：`docs/architecture/tool-evaluation-2026-06.md` 存在，文件头含时效性警告与已知过时点清单。；AC-9: AC-5：`docpath docs doctor` 能扫描到新增/既有项目文档（索引条目数增加），；AC-10: 且在存在真实问题时**如实报 ISSUES_FOUND 而非 HEALTHY**；跑 `docs fix` 后归零。；AC-11: AC-6：`docpath docs doctor` 终态为 HEALTHY，索引中不含任何已删除文件。；AC-12: 生成的 spec 可直接进入 `docpath plan`；AC-13: backlog 条目 R-367 与任务 T-20260923-project-intake 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
