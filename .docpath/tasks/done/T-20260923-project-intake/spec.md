# T-20260923-project-intake - 文档治理：清理 project-intake 下线残留与文档扫描盲区

> backlog_id: R-367
> backlog_source: docpath backlog add

## 1. 背景与动机

# 文档治理：清理 project-intake 下线残留与文档扫描盲区

2026-09-08 的提交 `de08364`（「待裁决大块收敛」）彻底下线了 project-intake 平行工作流——删除了
`src/commands/project.ts`（816 行）、`src/engine/project-intake.ts`（116 行）、
`tests/project-command.test.mjs`（263 行）等实现。

但该次下线**只删了代码，未清理文档残留**，导致仓库中遗留三类问题：

1. **根目录三件套**（23 KB 死重）：`REVIEW-project-intake.md`、`FIX-project-intake-concurrency.md`、
   `COMPLETION-project-intake-security-fix.md` 是对已删除功能的评审/修复/完成报告。三者相互引用、
   信息重复度 >60%，且引用的代码位置（`project.ts:80/265/317`、`atomicUpdateIntakeState`、
   `tests/project-lock.test.mjs`）**全部指向不存在的文件**——对后续 Agent 构成主动误导。

2. **活文档教用户使用已删除的命令**：`docs/getting-started.md` 第 4.1 节整段讲授
   `docpath project capture/analyze/brief/settle/backlog` 工作流，而该命令已从 CLI 移除
   （不在 `--help` 列表中）。新用户照做会直接报错。这是**优先级最高**的问题——它出现在
   被索引的正式活文档中。

3. **设计文档同样失效**：`docs/design/project-intake-artifact-model.md`（152 行）与
   `docs/design/project-intake-command-contract.md`（190 行）描述已下线的工件模型与命令契约。
   其中 `command-contract.md:5` 明确写着「Use `docpath project <action>`」。
   但 `artifact-model.md` 的 "Project Document Placement" 一节（L32-60）是**独立于该功能的
   通用决策**——它回答「项目文档该放 `docs/` 还是 `.docpath/`」，不受功能下线影响。

4. **文档扫描假绿**：`docpath docs doctor` 报「🟢 HEALTHY / 待治理项 0」，但根目录 4 个游离
   md 文件**从未进入扫描面**。根因是 `document_scan_paths` 是**白名单语义**（只扫声明路径，
   不递归未声明目录），而本项目配置仅声明了 `README.md` 与 `docs`——健康报告之所以干净，
   是因为**根本没看**那些文件。这是治理盲区伪装成健康状态。

- FR-1：删除根目录三个 project-intake 死重文档。
- FR-2：修正 `docs/getting-started.md`，移除已下线 `docpath project` 命令的用法，保留其中
  仍然有效的项目级需求梳理约定，并加入历史说明指向下线事实。
- FR-3：从 `artifact-model.md` 提炼出通用的「项目文档放置决策」，剥离 intake 专属内容
  （目录布局、状态机、命令契约、溯源模型、实现边界），形成独立设计文档；随后删除两份
  失效的 intake 设计文档。
- FR-4：将 `docpath-evaluation.md` 归档为历史档案（移入 `docs/architecture/`），并在文件头
  加入时效性标注，列出已知过时点，避免后人误当现状真源。
- FR-5：修正 `document_scan_paths` 声明，使扫描面覆盖实际存在的项目文档，消除假绿；
  并在配置中写明白名单语义，防止后续新增文档再次漏扫。

- 下线提交：`de08364`（2026-09-08）「feat: 待裁决大块收敛: project intake 平行工作流 /
  learn 与 lesson_summary 耦合 / config 命令归属」——`git show --stat de08364` 可见
  `src/commands/project.ts | 816 ---`、`src/engine/project-intake.ts | 116 ---`。
- 假绿实证：修复前 `docs doctor` 报 `🟢 HEALTHY 待治理项 0`；修正扫描面后立刻报
  `🟡 ISSUES_FOUND 待治理项 5`（2 幽灵条目 + 1 断链 + 2 未索引），`docs fix` 自愈后归零。
- 索引增长：986 → 990 条（新增收录 `AGENTS.md` / `CLAUDE.md` / `CODEX.md` / `OPENCODE.md`）。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 文档治理：清理 project-intake 下线残留与文档扫描盲区
  - 来源 backlog: R-367

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 文档治理：清理 project-intake 下线残留与文档扫描盲区

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 2026-09-08 的提交 `de08364`（「待裁决大块收敛」）彻底下线了 project-intake 平行工作流——删除了
- 目标: 文档治理：清理 project-intake 下线残留与文档扫描盲区
- 背景: 来自 backlog R-367
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户于 2026-09-23 明确指示执行 5 项文档治理动作

## 5. 验收标准

- [ ] AC-1: AC-1：`REVIEW-project-intake.md`、`FIX-project-intake-concurrency.md`、
- [ ] AC-2: `COMPLETION-project-intake-security-fix.md` 已从仓库移除。
- [ ] AC-3: AC-2：`docs/getting-started.md` 中不再出现 `docpath project` 命令示例；保留的文档约定
- [ ] AC-4: 描述准确；含指向 2026-09-08 下线事实的历史说明。
- [ ] AC-5: AC-3：`docs/design/project-document-placement.md` 存在且只含通用放置决策，
- [ ] AC-6: 不含 intake 专属内容；`project-intake-artifact-model.md` 与 `project-intake-command-contract.md`
- [ ] AC-7: 已删除；`docs/README.md` 索引已同步更新为新文档。
- [ ] AC-8: AC-4：`docs/architecture/tool-evaluation-2026-06.md` 存在，文件头含时效性警告与已知过时点清单。
- [ ] AC-9: AC-5：`docpath docs doctor` 能扫描到新增/既有项目文档（索引条目数增加），
- [ ] AC-10: 且在存在真实问题时**如实报 ISSUES_FOUND 而非 HEALTHY**；跑 `docs fix` 后归零。
- [ ] AC-11: AC-6：`docpath docs doctor` 终态为 HEALTHY，索引中不含任何已删除文件。
- [ ] AC-12: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-13: backlog 条目 R-367 与任务 T-20260923-project-intake 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
