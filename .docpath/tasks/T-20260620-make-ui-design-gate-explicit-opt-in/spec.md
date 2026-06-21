# T-20260620-make-ui-design-gate-explicit-opt-in - Make UI design gate explicit opt-in

> backlog_id: R-225
> backlog_source: docpath backlog add

## 1. 背景与动机

DocPath 是通用开发工作流状态机，不是默认设计流程管理器。当前 UI 设计门禁会在 unknown 场景下通过泛 UI 或前端关键词自动升级为 required，backlog promote 也会把页面、布局、组件、前端等词推断为产品 UI 实现。这会让普通前端开发被迫进入设计审批流程。

用户已通过 grill 明确决策：UI 设计能力保留在 DocPath 内作为证据化质量层，但只能显式启用。普通 UI 或前端开发不自动触发设计五件套。一旦显式启用，go 和 check 仍然执行硬门禁。

## 2. 需求清单

### 功能需求
- [ ] FR-1: resolveUiDesignRequirement 只在 spec.json 或 spec.md 显式 required 时返回 required，显式 exempt 继续优先豁免。
- [ ] FR-2: unknown 状态不再因为 page、layout、component、dashboard、CSS、frontend implementation 等泛 UI 或前端关键词自动升级为 required。
- [ ] FR-3: 显式设计意图仍可触发 required，包括 UI design、UX analysis、visual direction、prototype、Figma、v0、Stitch、Framer、design-preview、design approval、先设计、设计审批等。
- [ ] FR-4: backlog promote 只在显式设计意图存在时勾选 UI required，普通前端或页面任务默认勾选 UI exempt。
- [ ] FR-5: unknown 命中 UI 或前端关键词时最多产生非阻塞 advisory，不导致 docpath go 或 docpath check 失败。
- [ ] FR-6: 显式 required 时保持现有两级硬门禁：go 检查 frontend-stack、design-preview、approved design-approval 和 preview 深度；check 检查完整设计证据与视觉验收。
- [ ] FR-7: write-design 继续作为 DocPath 设计证据写入器保留，不作为自动触发器。
- [ ] FR-8: docpath-design skill 和模板文档改为显式 opt-in 语义。

### 非功能需求
- [ ] NFR-1: 保持已有显式 required/exempt 任务兼容，不迁移历史任务。
- [ ] NFR-2: 保持 DocPath 标准生命周期、major-change gate、check/review 行为兼容。
- [ ] NFR-3: 新规则需要有回归测试覆盖 required、exempt、unknown、backlog promote、go、check 分支。

## 3. 范围界定

### 包含
- UI 设计要求判定逻辑
- backlog promote UI gate 默认值推断
- go/check 中 unknown UI 关键词的非阻塞提示或不阻塞行为
- docpath-design skill 与模板文档
- 相关单元和端到端测试

### 不包含
- 不新增 docpath design 命令
- 不移除 write-design 命令
- 不迁移历史任务或重写已有 spec
- 不改变显式 required 时的设计证据文件集合
- 不改变产品 UI 实现本身

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | DocPath 定位 | 默认设计流程管理器 / 通用开发状态机 | 通用开发状态机 | 用户确认 DocPath 不是默认设计流程管理器 |
| 2 | UI gate 触发 | 泛关键词自动触发 / 显式 opt-in | 显式 opt-in | 避免普通前端开发被设计审批流程阻塞 |
| 3 | required 后门禁强度 | 建议 / 硬门禁 | 硬门禁 | 用户显式要求设计时，需要阻止未审批先实现 |
| 4 | 门禁分层 | go 前全部检查 / go 最小集 + check 完整集 | go 最小集 + check 完整集 | 区分开工前批准与收尾验收 |
| 5 | write-design 定位 | 外部工具 / DocPath 证据写入器 | DocPath 证据写入器 | 设计证据需要绑定 task_id 与 review/journal |
| 6 | 新入口 | 本轮新增 docpath design / 暂不新增 | 暂不新增 | 先修触发边界，避免扩大范围 |

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
- [x] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免设计五件套）
- [ ] 本任务涉及产品 UI 实现（go 前必须有 design-preview + 已批准 design-approval）

### Decision Brief
- 当前问题: UI 设计门禁触发过宽，泛 UI 或前端关键词会把普通开发任务升级为设计审批流程。
- 目标: UI 设计能力留在 DocPath 内，但只能显式启用。默认开发流程不包含 UI 设计五件套。
- 背景: 用户通过 grill 确认 DocPath 是通用开发工作流状态机，不是默认设计流程管理器。
- 可选方案: 保持当前自动触发；完全移除 UI 能力；改为显式 opt-in。
- 推荐方案: 改为显式 opt-in。显式 required 后仍保留 go/check 硬门禁。
- 不做什么: 不新增 docpath design 命令，不移除 write-design，不迁移历史任务，不改变 required 后的证据集合。
- 成本: 中等，涉及 ui-gate、backlog promote、go/check 输出、skill 模板和测试。
- 风险: 真实高风险 UI 任务如果用户忘记启用设计流程，将只收到 advisory。通过非阻塞提示降低遗漏风险。
- 回滚方案: 恢复 unknown 关键词回退和 backlog promote 泛 UI 推断。
- 用户确认: 用户确认 DocPath 是通用开发工作流状态机，不是默认设计流程管理器；只允许显式触发 UI 设计流程；触发后作为硬门禁；本轮不新增 docpath design 命令。

## 5. 验收标准

- [ ] AC-1: 未显式声明的普通页面、布局、组件、dashboard、CSS 或前端实现任务不会返回 UI required，也不会阻塞 go/check。
- [ ] AC-2: spec.json ui_gate required 和 spec.md 显式勾选 required 仍触发 go/check 硬门禁。
- [ ] AC-3: spec.json 或 spec.md 显式 exempt 即使正文含 UI 关键词也继续豁免。
- [ ] AC-4: backlog promote 对普通 UI/前端任务默认勾选不涉及产品 UI 实现。
- [ ] AC-5: backlog promote 对显式设计意图任务勾选涉及产品 UI 实现。
- [ ] AC-6: unknown UI/前端关键词最多产生非阻塞 advisory，命令退出码仍成功。
- [ ] AC-7: 显式 required 缺 frontend-stack、design-preview 或 approved design-approval 时，go 仍 fail-loud。
- [ ] AC-8: 显式 required 缺完整设计证据或视觉验收时，check 仍失败。
- [ ] AC-9: docpath-design skill 与 templates/codex-skills/docpath-design/SKILL.md 明确写成显式 opt-in。
- [ ] AC-10: 相关测试通过，至少覆盖 ui-gate、go-ui-gate、backlog-command、check-review 中受影响分支。

---

*此文件由 docpath write-spec 写入。*
