# DocPath Backlog Index

> 自动生成，供 agent / 人类稳定读取。

> 扫描时间: 2026-06-15T02:53:58.382Z

## 条目列表

| id | title | status | priority | level | task |
|----|-------|--------|----------|-------|------|
| R-001 | Fail-loud（CLI 不再静默吞参数/失败） | done | P0 | 1 | T-20260530-dp01 |
| R-002 | 完成 G2 状态统一（单一写入口） | done | P0 | 2 | T-20260530-dp02 |
| R-003 | 路由单一真源（消除死循环 + 统一 step id） | done | P0 | 2 | T-20260530-dp03 |
| R-040 | check 结构校验报错显示实际文件路径与定位 | done | P0 | 1 | T-20260601-check |
| R-041 | 检测并同步 tasks/current 与任务目录漂移 | done | P0 | 2 | T-20260601-tasks-current |
| R-043 | backlog add 分配 ID 时避免并发重复 | done | P0 | 1 | T-20260601-backlog-add-id |
| R-045 | 新增任务 abort/reset 状态流转 | done | P0 | 2 | T-20260601-abort-reset |
| R-046 | 降低 tasks/current 漂移修复摩擦 | done | P0 | 2 | T-20260601-drift-auto-fix |
| R-048 | next 仅提示未吸收 lesson 候选 | done | P0 | 1 | T-20260601-next-lesson-pending |
| R-049 | backlog promote 生成唯一 task_id | done | P0 | 1 | T-20260601-backlog-promote-task-id |
| R-078 | 修复状态机边界并恢复测试全绿 | done | P0 | 2 | T-20260602-task |
| R-133 | 新增统一重大变更门禁 | done | P0 | 3 | T-20260608-task-7 |
| R-147 | 增加开发前需求与UI分析工作流 | done | P0 | 3 | T-20260609-ui |
| R-149 | 增强开发前分析深度与质量门禁 | done | P0 | 3 | T-20260609-task |
| R-155 | 上下文读取策略索引化与规则高信号化 | done | P0 | 3 | T-20260612-task |
| R-157 | 修复 learn 低信号过滤与智能规则分类 | done | P0 | 3 | T-20260612-learn |
| R-160 | 明确 DocPath 多人团队定位并重排协作路线图 | done | P0 | 2 | T-20260613-docpath |
| R-161 | 强化 handoff 交接包，支持多人 / 多 Agent 接力恢复 | done | P0 | 2 | T-20260613-handoff-agent |
| R-162 | 修正 check checklist 同步门禁语义 | done | P0 | 2 | T-20260613-check-checklist |
| R-163 | Schema-first JSON/JSONL 真源迁移 | done | P0 | 3 | T-20260613-schema-first-json-jsonl |
| R-165 | 修复 dogfood 暴露的生命周期与证据模型问题 | done | P0 | 3 | T-20260614-dogfood |
| R-168 | 建立 backlog 需求成熟度门禁与 spec 回填闭环 | done | P0 | 3 | T-20260614-backlog-spec |
| R-170 | 收紧文档索引生成视图与空任务路由边界 | done | P0 | 3 | T-20260614-task |
| R-178 | workspace 老化策略 — 实现自动清理 | done | P0 | 2 | T-20260615-workspace |
| R-179 | docs-index 归档策略 — 物理移除旧条目 | proposed | P0 | 2 |  |
| R-010 | 需求管理 / Backlog 层 | done | P1 | 2 | current |
| R-011 | 实现 write-plan / write-journal 命令并打通断头引用 | done | P1 | 2 | T-20260531-write-plan-write-journal |
| R-012 | 接活 lifecycle.ts 事件系统并打通 agent enter/done 哨兵副作用 | done | P1 | 2 | T-20260531-lifecycle-ts-agent-enter-done |
| R-016 | agent done 跳过测试时强制提供结构化理由 | done | P1 | 2 | T-20260531-agent-done |
| R-020 | 为 go 命令增加步骤收尾状态并同步 plan | done | P1 | 2 | T-20260531-go-plan |
| R-021 | 为 status --agent 增加 plan/breadcrumb 漂移摘要 | done | P1 | 2 | T-20260531-status-agent-plan-breadcrumb |
| R-022 | 增强 check 的 plan-breadcrumb 漂移报告与修复建议 | done | P1 | 2 | T-20260531-check-plan-breadcrumb |
| R-025 | 统一 stale pending-done 的 24h 告警入口 | done | P1 | 2 | T-20260531-stale-pending-done-24h |
| R-026 | 细化 check 失败后的恢复路由 | done | P1 | 2 | T-20260531-check |
| R-028 | 清理过时协议模板并统一 Claude 协议文案 | done | P1 | 2 | T-20260531-claude |
| R-029 | 清理过时 AGENTS 协议模板并统一 Codex/OpenCode 协议文案 | done | P1 | 2 | T-20260531-agents-codex-opencode |
| R-030 | 清理过时 OpenCode 协议模板并统一安装文案 | done | P1 | 2 | T-20260531-opencode |
| R-031 | 修复 docpath plan 与 go 之间的 plan 写入断点 | done | P1 | 2 | T-20260531-docpath-plan-go-plan |
| R-032 | 增强 agent handoff 交接包并附带 next 路由结果 | done | P1 | 2 | T-20260531-agent-handoff-next |
| R-033 | 增强非法工作流状态转移的错误提示 | done | P1 | 2 | T-20260531-task |
| R-034 | 补齐未知位置参数的 fail-loud 校验 | done | P1 | 2 | T-20260531-fail-loud |
| R-042 | 隔离测试构建产物避免 dist 清理竞争 | done | P1 | 1 | T-20260601-dist |
| R-044 | 实现 docpath gc 清理历史任务目录 | done | P1 | 2 | T-20260601-docpath-gc |
| R-047 | next 引导 lesson 候选固化 | done | P1 | 2 | T-20260601-next-lesson |
| R-050 | 暴露 backlog refresh 命令重建索引 | done | P1 | 1 | T-20260601-backlog-refresh |
| R-051 | 修复 docpath plan 只输出提示不写入 plan.md 的断点 | done | P1 | 2 | T-20260601-docpath-plan-plan-md |
| R-057 | 修复 check_fail 路由推荐不存在的 debug reproduce 命令 | done | P1 | 1 | T-20260601-check-fail-debug-reproduce |
| R-079 | 清理明确冗余目录和运行态备份文件 | done | P1 | 2 | T-20260602-task-2 |
| R-085 | 补齐版本号与安装资产同步检测 | done | P1 | 1 | T-20260606-task |
| R-087 | 为 install manifest 漂移检测增加 check-only 模式 | done | P1 | 2 | T-20260606-install-manifest-check-only |
| R-089 | 增强 brainstorm 生成可执行 spec 草稿与澄清问题 | done | P1 | 2 | T-20260606-brainstorm-spec |
| R-090 | 梳理 DocPath 信息架构并降低 backlog/task/workspace/spec 重叠 | done | P1 | 3 | T-20260606-docpath-backlog-task-workspace-spec |
| R-091 | 支持 backlog add 写入背景与验收正文 | done | P1 | 2 | T-20260606-backlog-add |
| R-092 | 支持 backlog edit 安全修改条目 | done | P1 | 2 | T-20260606-backlog-edit |
| R-093 | 实现 backlog groom 需求池健康检查 | done | P1 | 2 | T-20260606-backlog-groom |
| R-094 | 新增 changes 变更收口命令 | done | P1 | 2 | T-20260607-changes |
| R-095 | 新增 HTML 页面展示数据和流程 | done | P1 | 2 | T-20260608-html |
| R-096 | 优化产品形态需求澄清工作流 | done | P1 | 2 | T-20260608-task |
| R-142 | 引入 Role Profile 与 role-based context | done | P1 | 3 | T-20260609-role-profile-role-based-context |
| R-143 | 引入结构化 Payload 与 Hybrid Context Index | done | P1 | 3 | T-20260609-payload-hybrid-context-index |
| R-144 | 增加业务交付物模板库与 deliverables 索引 | done | P1 | 2 | T-20260609-deliverables |
| R-146 | 对外部参考项目能力进行 DocPath Fit Assessment | done | P1 | 2 | T-20260609-docpath-fit-assessment |
| R-148 | 修复开发前分析能力的MVP窄化问题 | done | P1 | 3 | T-20260609-mvp |
| R-150 | 修正 analyze dry-run 语义与 Skill 前置分析指引 | done | P1 | 2 | T-20260609-analyze-dry-run-skill |
| R-156 | 产品化 CLI 体验与交互式初始化 | done | P1 | 2 | T-20260612-cli |
| R-158 | decisions.md 老化策略避免无限增长 | done | P1 | 1 | T-20260612-decisions-md |
| R-159 | 收紧 journal 到 decisions.md 的 ADR 写入规则 | done | P1 | 2 | T-20260612-journal-decisions-md-adr |
| R-164 | 深化 spec.json schema 与门禁字段 | done | P1 | 3 | T-20260613-spec-json-schema |
| R-013 | 为 write-spec / write-plan 增加必备字段校验 | done | P2 | 2 | T-20260531-write-spec-write-plan |
| R-014 | 统一 progress 计数与 step-finder 的 plan 解析 | done | P2 | 2 | T-20260531-progress-step-finder-plan |
| R-015 | 分配真实 task_id 并统一 tasks/current 与任务归档路径策略 | done | P2 | 2 | T-20260531-task-id-tasks-current |
| R-017 | 为 learn 增加 from-journal 管线与 dry-run 预览 | done | P2 | 2 | T-20260531-learn-from-journal-dry-run |
| R-018 | status 在 pending-done 场景下输出未收尾告警 | done | P2 | 2 | T-20260531-status-pending-done |
| R-019 | agent step 在 skipped/blocked 场景下同步 plan 状态 | done | P2 | 2 | T-20260531-agent-step-skipped-blocked-plan |
| R-023 | journal 自动提取架构决策并追加 decisions 日志 | done | P2 | 2 | T-20260531-journal-decisions |
| R-024 | 强化 learn 的去重与来源策略 | done | P2 | 2 | T-20260531-learn |
| R-027 | 补齐 codex 安装目标的独立验收 | done | P2 | 2 | T-20260531-codex |
| R-035 | 修复 review 提示中的文件名占位符输出 | done | P2 | 1 | T-20260531-review |
| R-036 | 补齐 review --dry-run 预览模式 | done | P2 | 1 | T-20260531-review-dry-run |
| R-037 | 让 continue 命令对齐 next 路由与新状态模型 | done | P2 | 2 | T-20260531-continue-next |
| R-038 | 让 resume 命令对齐当前状态真源与路由 | done | P2 | 2 | T-20260531-resume |
| R-039 | 让 status 人类输出对齐 phase/gate 真源 | done | P2 | 1 | T-20260531-status-phase-gate |
| R-052 | 拆分 planCommand 降低函数复杂度警告 | done | P2 | 1 | T-20260601-plancommand |
| R-053 | 拆分 refineCommand 降低函数复杂度警告 | done | P2 | 1 | T-20260601-refinecommand |
| R-054 | 拆分 docsScan 降低函数复杂度警告 | done | P2 | 1 | T-20260601-docsscan |
| R-055 | 拆分 statusCommand 降低函数复杂度警告 | done | P2 | 1 | T-20260601-statuscommand |
| R-056 | 拆分 installCommand 降低函数复杂度警告 | done | P2 | 1 | T-20260601-installcommand |
| R-058 | 拆分 debugCommand 降低函数复杂度警告 | done | P2 | 1 | T-20260601-debugcommand |
| R-059 | 拆分 renderCurrentDocument 降低函数复杂度警告 | done | P2 | 1 | T-20260601-rendercurrentdocument |
| R-060 | 拆分 readLegacyCurrentMd 降低函数复杂度警告 | done | P2 | 1 | T-20260601-readlegacycurrentmd |
| R-061 | 拆分 generateAgentOutput 降低函数复杂度警告 | done | P2 | 2 | T-20260601-generateagentoutput |
| R-062 | 拆分 extractPatternsFromJournal 降低函数复杂度警告 | done | P2 | 2 | T-20260601-extractpatternsfromjournal |
| R-063 | 消除 check.ts 中的 any 类型警告 | done | P2 | 2 | T-20260601-check-ts-any |
| R-064 | 拆分 brainstormCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-brainstormcommand |
| R-065 | 拆分 agentCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-agentcommand |
| R-066 | 拆分 renderCompactedContext 降低函数复杂度警告 | done | P2 | 2 | T-20260601-rendercompactedcontext |
| R-067 | 拆分 learnCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-learncommand |
| R-068 | 移除 agent-prompt 生产 console.log 警告 | done | P2 | 2 | T-20260601-agent-prompt-console-log |
| R-069 | 移除 breadcrumb 生产 console.log 警告 | done | P2 | 2 | T-20260601-breadcrumb-console-log |
| R-070 | 移除 lifecycle 生产 console.log 警告 | done | P2 | 2 | T-20260601-lifecycle-console-log |
| R-071 | 拆分 goCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-gocommand |
| R-072 | 拆分 reviewCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-reviewcommand |
| R-073 | 拆分 journalCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-journalcommand |
| R-074 | 拆分 runHarnessChecks 降低函数复杂度警告 | done | P2 | 2 | T-20260601-runharnesschecks |
| R-075 | 拆分 checkCommand 降低函数复杂度警告 | done | P2 | 2 | T-20260601-checkcommand |
| R-076 | 拆分 registerCommands 降低函数复杂度警告 | done | P2 | 2 | T-20260601-registercommands |
| R-077 | 清理 review TODO 自触发提示 | done | P2 | 2 | T-20260601-review-todo |
| R-080 | 评估并清理历史夹具目录 | done | P2 | 2 | T-20260602-task-3 |
| R-081 | 重构 registerCommands 拆分为独立命令文件注册 | done | P2 | 2 | T-20260602-registercommands |
| R-082 | 在 check 检测到漂移时支持交互式或自动修复 | done | P2 | 2 | T-20260603-check |
| R-083 | 打通 learn 机制到 next --agent 智能引导流 | done | P2 | 2 | T-20260603-learn-next-agent |
| R-084 | 实现 git hooks 安装与 pre-commit 门禁校验 | done | P2 | 2 | T-20260603-git-hooks-pre-commit |
| R-086 | 补齐安装模板资产 manifest 与漂移检测 | done | P2 | 2 | T-20260606-manifest |
| R-088 | 拆分 docs-install 注册逻辑降低函数复杂度警告 | done | P2 | 1 | T-20260606-docs-install |
| R-145 | 增加 Codex Skill 适配器封装 DocPath 专家团入口 | done | P2 | 2 | T-20260609-codex-skill-docpath |
| R-151 | 瘦身 AGENTS.md 减少与 DocPath Skill 重叠 | done | P2 | 1 | T-20260609-agents-md-docpath-skill |
| R-152 | 允许 AGENTS.md 定制但继续校验 Skill manifest 漂移 | done | P2 | 2 | T-20260609-agents-md-skill-manifest |
| R-153 | 优化 DocPath Codex Skills 文案与触发边界 | done | P2 | 2 | T-20260609-docpath-codex-skills |
| R-166 | 智能索引架构：CLI 返回索引，Agent 按需深读 | done | P2 | 2 | T-20260614-cli-agent |
| R-167 | Phase 2&3: 索引增强 + 按需深读 | done | P2 | 2 | T-20260614-phase-2-3 |
| R-169 | probe | dropped | P2 | 2 |  |
| R-171 | 新增多 session 隔离与并发 | done | P2 | 2 | T-20260614-session |
| R-172 | 将 docpath changes 纳入完成态 git closeout 路由 | done | P2 | 2 | T-20260614-docpath-changes-git-closeout |
| R-173 | 明确 AI 辅助命令边界：prompt emitter vs artifact sink vs workflow gate | done | P2 | 2 | T-20260614-ai-prompt-emitter-vs-artifact-sink-vs-wo |
| R-174 | 明确 current alias、任务归档与多 agent install target 语义 | done | P2 | 2 | T-20260614-current-alias-agent-install-target |
| R-175 | 修复 backlog capture 无活跃任务时 analyze 建议缺少 --dry-run | done | P2 | 2 | T-20260614-backlog-capture-analyze-dry-run |
| R-176 | 将 agent 启动协议改为单命令 next --agent | done | P2 | 2 | T-20260614-agent-next-agent |
| R-177 | 前置重大变更门禁、明确 next/go 边界并统一 next_hint 输出 | done | P2 | 3 | T-20260614-next-go-next-hint |
| R-180 | 技术债务清理 — 删除废弃文件和未使用依赖 | proposed | P2 | 1 |  |
| R-181 | 修复 CLI 文档系统 workflow review 发现的 cleanup、archive、install、status 边界问题 | done | P2 | 2 | T-20260615-cli-workflow-review-cleanup-archive-inst |
| R-182 | 数据统一：消除 MD↔JSON 双向同步，建立 JSON 单真源 | proposed | P2 | 3 |  |
| R-154 | test-ui-gate-probe | dropped | P3 | 1 |  |

## 用途说明

- `id`: backlog 条目标识（R-###）
- `status`: proposed|accepted|planned|active|done|dropped
- `priority`: P0 最高，P3 最低
- `task`: 已 promote 后关联的 task id；未关联为空
