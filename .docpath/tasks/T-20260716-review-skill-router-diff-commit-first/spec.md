# T-20260716-review-skill-router-diff-commit-first - review skill router 只审未提交 diff, commit-first 收口惯例会整体绕过语言级审查

> backlog_id: R-276
> backlog_source: docpath backlog capture

## 1. 背景与动机

2026-07-16 代码核验 (analysis: .docpath/backlog/analysis/R-276-analysis.md):
三事实叠加成完整绕过链——F1 review 默认 scope='all' 仅审工作区, 树干净即
not_required (R-274 实测, 一个脏 spec.json 即抑制既有 task 自动切换); F2
commit-first 收口惯例被重大变更门禁信号设计鼓励, 语言级审查被系统性绕过; F3
done 复用纯 60min 时间窗不绑 HEAD, review 后再提交不触发重审。task 口径
(started_at 以来提交∪工作区) 已在 review.ts 完整实现但 CLI 枚举未放行,
router 指纹 task 分支用全历史与之不一致。用户裁定: 方案 A + 复用绑定 HEAD。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-276-analysis.md

## 2. 需求清单

### 功能需求
- [x] FR-1: review 默认口径——有活跃任务且任务锚点可解析时默认 scope='task', 否则回退 'all'; 显式 --scope 仍优先; 空仓/无提交时 task 口径降级覆盖工作区 (taskCommitFiles 失败不拖垮并集)。任务锚点 = canonical 任务目录 breadcrumb 首条时间戳, 回退 state.started_at——后者是 phase 开始时间, 每次 phase 转移被刷新, 直接用会在 review 失败等转移后静默缩小任务 diff (收口自证时发现并修复, 含锚点回归用例)。
  - 来源 backlog: R-276
- [x] FR-2: CLI 枚举放行 task——review --scope 与 write-review-skill --scope 接受 task, 帮助文案更新, 缺省值下沉到命令内与 review 同源解析。
- [x] FR-3: router 指纹对齐——review-skill-router.ts diffForFile(task) 改为 baseRef..HEAD + 工作区 (与 review.ts 同口径), resolveTaskBaseRef 收敛到 router 单一定义, 调用方传入 taskBaseRef。
- [x] FR-4: 复用绑定 HEAD——ReviewEvidence 增加 head 字段 (append-only); review 两处证据写入记录当前 HEAD; canReuseReviewGate 在 evidence.head 存在且 ≠ 当前 HEAD 时拒绝复用; 旧证据无 head 维持时间窗判定。

### 非功能需求
- [x] NFR-1: 保持与现有 DocPath 工作流兼容 (全量测试回归; 旧证据/无任务场景行为不变)

## 3. 范围界定

### 包含
- src/commands/review.ts (默认口径解析 + head 记录 + baseRef 传递)
- src/utils/review-skill-router.ts (resolveTaskBaseRef + task 指纹对齐)
- src/commands/write-review-skill.ts (task 口径 + 同源默认解析)
- src/commands/agent.ts (canReuseReviewGate HEAD 绑定)
- src/utils/workspace-evidence.ts (head 字段)
- src/commands/register/quality.ts (CLI 枚举/帮助)
- tests: 既有契约迁移 + tests/review-task-scope.test.mjs 六条验收用例

### 不包含
- check 复用 (last-check 证据) 的 HEAD 绑定 (如需另立)
- 重大变更门禁口径调整 (机制独立, 维持现状)
- review 发现项行级基线细化

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 口径修正方式 | A 默认 task / B 惯例改 review 先于 commit / C done 干净树 last_commit / D 维持现状 | A | 基础设施已存在; 与提交时序解耦; B 靠自觉且与重大变更门禁 commit-first 缓解路径冲突; C 多提交任务仍漏 |
| 2 | F3 复用漏洞 | 绑定 HEAD / 后续另立 | 绑定 HEAD | append-only 字段向后兼容, 彻底封住时序逃逸 |

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
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: review skill router 只审未提交 diff, 与 commit-first 收口惯例组合时语言级审查被系统性绕过; done 复用纯时间窗, review 后再提交不触发重审。
- 目标: 语言级审查覆盖任务累计 diff, 与提交时序解耦; 复用判定感知 review 后的新提交。
- 可选方案:
  - 方案 A: review 默认 task 口径 + CLI 放行 + router 指纹对齐 (+ 复用绑定 HEAD)
  - 方案 B: 惯例改为 review 先于 commit (纯规则, 无机器强制, 与重大变更门禁缓解路径冲突)
  - 方案 C: done 干净树强制 last_commit (多提交任务仍漏)
  - 方案 D: 维持现状仅记录 (门禁形同虚设)
- 推荐方案: 方案 A + HEAD 绑定
- 决策理由: task 基础设施已存在只缺接线; 与提交时序解耦从机制上封绕过; append-only 字段向后兼容旧证据。
- 不做什么: 不动重大变更门禁口径; 不做 check 复用 HEAD 绑定; 不改 review 发现项行级基线。
- 成本: 中等——6 个源文件 + 测试迁移; 任务内多次提交会推进指纹, 重复 review 需重写 skill 证据 (门禁本意)。
- 风险: 既有依赖 scope=all 默认的脚本/测试需迁移 (本任务已迁移仓内全部); 空仓边界已降级处理。
- 回滚方案: 回滚本任务提交, review 默认回到 all, 旧证据无 head 字段自动回到时间窗判定。
- 用户确认: 2026-07-16 用户裁定: 方案 A (review 默认 task 口径, 活跃任务+started_at→task 否则回退 all; CLI 枚举放行 task; router 指纹对齐 baseRef..HEAD+工作区) + 加固复用绑定 HEAD (ReviewEvidence 增 head 字段 append-only, canReuseReviewGate HEAD 变化拒绝复用, 旧证据向后兼容)。
- 变更类型说明: 仅勾"工作流 / Agent 行为" (review/done 门禁口径); promote 预勾的"权限/写操作边界""范围扩大"与实际不符, 已取消。

## 5. 验收标准

- [x] AC-1: 活跃任务内树干净但任务有提交时, docpath review 的 router requirements 覆盖任务累计 diff 的 TS/JS 文件, 不再 not_required (review-task-scope AC-1 用例)。
- [x] AC-2: 无活跃任务 (或 started_at 缺失) 时 review 行为与现状一致 (scope=all 回退; 既有无任务用例回归)。
- [x] AC-3: router 指纹 task 口径与 review.ts 一致——同状态稳定, 新提交后变化 (AC-3 用例)。
- [x] AC-4: review 后新提交 ⇒ done 拒绝复用并重审 (HEAD moved); head 匹配与无 head 旧证据均维持复用 (三态用例)。
- [x] AC-5: pnpm test 全绿 (644/644, 含 7 条新用例——6 条验收 + 1 条 phase 转移锚点回归——及既有契约迁移到 task 口径)。
- [x] AC-6: 生成的 spec 可直接进入 `docpath plan` (已执行, S1-S3 完成)。
- [x] AC-7: backlog 条目 R-276 与任务 T-20260716-review-skill-router-diff-commit-first 建立双向关联。

---

*此文件由 `docpath backlog promote` 生成。*
