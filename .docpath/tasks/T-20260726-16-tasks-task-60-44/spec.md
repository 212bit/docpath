# T-20260726-16-tasks-task-60-44 - 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)

> backlog_id: R-299
> backlog_source: docpath backlog add

## 1. 背景与动机

命令面 60 项（29 core/19 advanced/9 hidden/3 deprecated），1243 次 trace 实测仅 28 项承载全部使用、32 项零调用。2026-07-27 用户逐组勾选确认砍除方案：组A 零使用死命令 12 项（deprecated 三件套 brainstor/disclosure/tdd + 过时视图 resume/prompt/discover/export/compact + 展示类 roles/deliverables/stats + 一次性迁移 migrate-breadcrumb）、组B 步进糖 4 项（start/step/retry/unblock，语义被 go/agent step/recover 覆盖）、组C tasks 并入 task 子动作（同名易混，协议引用同步）。保留项核查：brainstorm（协议引用+14 次使用）、done/recover/debug（路由引用）、merge-driver（git 调用）、render/write-design（门禁/提示引用）。

六维清理：注册（register/*.ts）+ 实现文件 + command-metadata + src 内提示/路由引用（含 transitions 的 tdd 前缀）+ 模板 slash 命令（保留 docpath-brainstorm/docpath-agent-step 两个同名前缀误伤项）+ 协议 canonical（tasks drift→task drift，root 副本同步）。tasks 保留一个版本周期的 deprecated 转发（指向 task drift/sync）。删除对应测试（resume/roles/deliverables），brainstorm 测试中 brainstor 别名断言改为拒绝断言。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-286-analysis.md


## 2. 需求清单

### 功能需求
- [ ] FR-1: 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
  - 来源 backlog: R-299

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)

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
- 当前问题: 命令面 60 项（29 core/19 advanced/9 hidden/3 deprecated），1243 次 trace 实测仅 28 项承载全部使用、32 项零调用。2026-07-27 用户逐组勾选确认砍除方案：组A 零使用死命令 12 项（deprecated 三件套 brainstor/disclosure/tdd + 过时视图 resume/prompt/discover/export/compact + 展示类 roles/deliverables/stats + 一次性迁移 migrate-breadcrumb）、组B 步进糖 4 项（start/step/retry/unblock，语义被 go/agent step/recover 覆盖）、组C tasks 并入 task 子动作（同名易混，协议引用同步）。保留项核查：brainstorm（协议引用+14 次使用）、done/recover/debug（路由引用）、merge-driver（git 调用）、render/write-design（门禁/提示引用）。
- 目标: 命令面收缩: 删 16 项零使用命令+tasks 并入 task (用户逐组确认, 60→44)
- 背景: 来自 backlog R-299，Decision Brief 证据: 1243 次 trace 使用证据+协议/路由引用逐项核查; 用户 2026-07-27 三组问答逐项勾选确认(组A 全选/组B 删除/组C 合并); 保留清单: brainstorm/done/recover/debug/merge-driver/render/write-design 均有引用方
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-27 用户方案比选逐组勾选: 组A 四子组全选, 组B 删除四个, 组C 合并

### 已有 Decision Brief (来自 backlog evidence)

1243 次 trace 使用证据+协议/路由引用逐项核查; 用户 2026-07-27 三组问答逐项勾选确认(组A 全选/组B 删除/组C 合并); 保留清单: brainstorm/done/recover/debug/merge-driver/render/write-design 均有引用方

## 5. 验收标准

- [ ] AC-1: 16 项命令注册/实现/元数据/模板移除，CLI 调用报未知命令；metadata 计数 60→44（含 tasks deprecated 转发 45）。
- [ ] AC-2: src 内零残留死引用（grep 断言）；transitions 路由前缀清理 tdd。
- [ ] AC-3: task drift/sync 子动作可用，tasks 转发+弃用提示；协议 canonical 与 root 副本同步更新。
- [ ] AC-4: 全量套件绿（被删命令的测试同步移除/改写）。
- [ ] AC-5: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-6: backlog 条目 R-299 与任务 T-20260726-16-tasks-task-60-44 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
