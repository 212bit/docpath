# T-20260923-changed-files-scope-quick-done - 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）

> backlog_id: R-363
> backlog_source: docpath backlog add

## 1. 背景与动机

step-pass / next 在任务收尾时输出的「推荐收尾路线」是静态模板：无论本次实际改了什么，都把 `docpath quick-done` 列为「推荐」第一项。但 quick-done 服务于 quick 通道，受 quick-guard 约束（RISKY_PATH_PATTERNS + max_changed_files=3）。当任务实际改了 `src/engine/**`、`src/commands/(agent|check|done|go|journal|review|runtime|register)` 等核心路径时，quick 通道在 done 阶段必拒，用户/Agent 顺着「推荐」走会在收尾时才失败并被迫升级标准生命周期，白绕一圈。

同一次 next 输出内还自相矛盾：推荐块给 quick-done，而 `next_hint.recommended_command` 却是 `docpath agent enter`、`next_action` 写「开始或恢复任务执行」——收口阶段仍挂着执行期提示。

实例（2026-09-23 R-356/R-362 收口）：R-356 改 `src/engine/backlog.ts` + 新增 utils 文件 + 新增测试文件（十余个文件），step-pass 仍推荐 quick-done；实际必须走 check -> review -> journal。用户需反问「为什么没按推荐的 quick-done」才暴露该缺口。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/R363-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）
  - 来源 backlog: R-363

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

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
- 当前问题: step-pass / next 在任务收尾时输出的「推荐收尾路线」是静态模板：无论本次实际改了什么，都把 `docpath quick-done` 列为「推荐」第一项。但 quick-done 服务于 quick 通道，受 quick-guard 约束（RISKY_PATH_PATTERNS + max_changed_files=3）。当任务实际改了 `src/engine/**`、`src/commands/(agent|check|done|go|journal|review|runtime|register)` 等核心路径时，quick 通道在 done 阶段必拒，用户/Agent 顺着「推荐」走会在收尾时才失败并被迫升级标准生命周期，白绕一圈。
- 目标: 收尾路线推荐应按实际 changed files 做 scope 判定（quick-done 误推）
- 背景: 来自 backlog R-363
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: step-pass / next 输出收尾路线前，基于本次实际 changed files（复用 quick-guard 的 `evaluateQuickScope` / `RISKY_PATH_PATTERNS` 判定）做 scope 分类；
- [ ] AC-2: 命中 RISKY_PATH_PATTERNS 或 guardedFiles 超 max_changed_files 时，不得把 quick-done 标为「推荐」，应推荐 `check -> review -> agent done`（标准收口）；
- [ ] AC-3: 仅当改动确实落在 quick 允许范围（scope 判定通过）时，quick-done 才作为推荐项；
- [ ] AC-4: 收口阶段（所有 plan 步骤已完成）的 next_hint 不应再给 agent enter / 「开始或恢复任务执行」这类执行期提示，应按阶段给出收口命令；
- [ ] AC-5: 有回归测试覆盖：核心路径改动 -> 推荐不含 quick-done；叶子改动 -> 推荐含 quick-done。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-363 与任务 T-20260923-changed-files-scope-quick-done 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
