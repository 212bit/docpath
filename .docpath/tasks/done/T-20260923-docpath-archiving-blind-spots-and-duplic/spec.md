# T-20260923-docpath-archiving-blind-spots-and-duplic - DocPath archiving blind spots and duplicate registration patterns

> backlog_id: R-352
> backlog_source: docpath backlog capture

## 1. 背景与动机

# DocPath archiving blind spots and duplicate registration patterns

DocPath 的归档机制存在盲区：只有 done 条目会被自动归档，dropped 条目没有自动路径，CLI 动作集里也没有 archive。重复登记已成模式：多会话并行时，一个会话看到别人已合并的成果后，把它当作待办重新走了一遍 backlog → promote → plan → done，生成新 ID。

1. 实现 dropped 条目自动归档路径（e.g. .docpath/tasks/done/dropped-YYYYMMDD/）。
2. 添加 CLI archive 动作 `docpath archive <id>`。
3. 在 promote 阶段添加去重逻辑：扫描已存在的同名/同内容任务 ID，提示合并或 skip。

- 实现：engine/backlog.ts:445 (only done auto-archive)
- 观察：多会话并行导致重复 ID
- 分析：analysis/requirements.md, analysis/technical.md

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-352-requirements.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: DocPath archiving blind spots and duplicate registration patterns
  - 来源 backlog: R-352

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- DocPath archiving blind spots and duplicate registration patterns

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
- 当前问题: DocPath 的归档机制存在盲区：只有 done 条目会被自动归档，dropped 条目没有自动路径，CLI 动作集里也没有 archive。重复登记已成模式：多会话并行时，一个会话看到别人已合并的成果后，把它当作待办重新走了一遍 backlog → promote → plan → done，生成新 ID。
- 目标: DocPath archiving blind spots and duplicate registration patterns
- 背景: 来自 backlog R-352
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

- [ ] AC-1: dropped 条目归档后在 archive/ 或 done/ 中找到。
- [ ] AC-2: 重复登记时有明确提示并记录证据。
- [ ] AC-3: 门禁检查通过（level 2 maturity）。
- [ ] AC-4: dropped 条目归档后在 archive/ 或 done/ 中找到。
- [ ] AC-5: 重复登记时有明确提示并记录证据。
- [ ] AC-6: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-7: backlog 条目 R-352 与任务 T-20260923-docpath-archiving-blind-spots-and-duplic 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
