# T-20260715-review-skip-skill-review-crash-item-spli - review --skip-skill-review 重复传参 crash: item.split is not a function

> backlog_id: R-254
> backlog_source: docpath backlog capture

## 1. 背景与动机

[来源: docpath 项目现场，R-251 修复过程中复现] 执行 `docpath review --skip-skill-review docpath-review-javascript --reason "..." --skip-skill-review docpath-review-typescript --reason "..."`（同一 skill gate 传了两次 `--skip-skill-review`）时，review 崩溃并输出：
`❌ 未预期的错误 / item.split is not a function`。

代码核实：`src/commands/review.ts` 的 `normalizeSkillSkipList` 假设输入数组中的每一项都是 string，并直接调用 `item.split(',')`。当 CLI 重复传 `--skip-skill-review` 或传入异常 option 形态时，item 可能是数组、boolean、undefined 或其他非 string 值，从而 TypeError。

追加现场问题：`docpath review --dry-run --scope last_commit` 曾输出 `fatal: invalid --pretty format: ""`，随后被上游 catch 当作“未发现变更文件”。根因是 `git show --name-only --format="" HEAD` 把带引号的空 pretty format 交给 git；正确参数应是 `--format=`。该问题让 agent 无法审最近一次 commit，被迫扩大 review scope，间接增加 R-255 file-set mismatch 的触发概率。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `review --skip-skill-review` 支持重复 flag 与逗号分隔输入，归一化为 skill 名列表，不因 array/non-string item 触发 `item.split is not a function`。
- [ ] FR-2: `review --scope last_commit` 与 `write-review-skill --scope last_commit` 使用合法 git pretty format 参数，能正确收集最近一次 commit 的可审查文件。
- [ ] FR-3: `--skip-skill-review` 缺值或非字符串值时 fail-loud，输出明确的参数错误，不再落入笼统 TypeError。

### 非功能需求
- [ ] NFR-1: 保持现有 review skill gate 语义兼容；单次 `--skip-skill-review A,B`、单 skill skip、无 skip 的 review 行为不回归。
- [ ] NFR-2: 不在本任务中改变 R-255 的 file-set mismatch 阻塞策略；本任务只修复 skip 参数解析与 last_commit scope 收集。

## 3. 范围界定

### 包含
- `src/commands/review.ts` 的 skip skill 参数归一化与 last_commit 文件收集。
- `src/commands/write-review-skill.ts` 的 last_commit 文件收集同步修复。
- CLI 注册层对重复 `--skip-skill-review` option 形态的类型兼容。
- 回归测试覆盖重复 skip flag 与 last_commit dry-run。

### 不包含
- R-255 的 review-skill file set mismatch 降级策略。
- R-248 顶层 catch 的全局错误格式重构。
- `changes --agent` task-aware 文件分组能力。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | skip 参数异常输入处理 | `String(item)` 强转 / 过滤非 string / 对非 string fail-loud | 对非 string fail-loud，数组递归展开 | 强转会把 `true` 变成伪 skill 名；过滤会静默吞掉缺值。fail-loud 更符合 CLI 参数错误语义。 |
| 2 | last_commit git 参数 | 保持 `--format=""` / 改为 `--format=` | 改为 `--format=` | git 接受空 pretty format 的正确写法，不会输出提交元信息，也不会 fatal。 |
| 3 | R-255 关联处理 | 顺手改 mismatch 策略 / 仅记录关联不改 | 仅记录关联不改 | mismatch 阻塞策略是独立产品/工作流决策，应由 R-255 单独处理。 |

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
- [x] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: review skip 参数重复传参会 crash；last_commit scope 使用非法 git pretty format 参数导致 fatal 后误判无变更。
- 目标: 让 review skip 参数解析和 last_commit scope 成为可恢复、可测试、可诊断的稳定路径。
- 背景: R-254 由真实 docpath review 收尾场景暴露；用户在 2026-07-15 明确回复“同意 R-254”。
- 可选方案: A. 只修 skip crash；B. 同时修 skip crash 与同 backlog 已记录的 last_commit fatal；C. 扩大到 R-255 mismatch 策略。
- 推荐方案: B。
- 决策理由: B 覆盖 R-254 已记录验收与同源 review scope bug，范围仍局限于参数解析和文件收集；C 会扩大到独立 gate 策略。
- 不做什么: 不改变 review skill evidence file-set mismatch 阻塞语义；不重构全局顶层 catch；不改 changes --agent scope 分组。
- 成本: 小到中等，集中在 review/write-review-skill 两条命令和回归测试。
- 风险: CLI 框架对重复 option 的实际 shape 可能随版本不同；通过递归展开数组和非 string fail-loud 降低风险。
- 回滚方案: 回退本任务提交，恢复旧参数归一化和 last_commit git 参数。
- 用户确认: 用户在 2026-07-15 明确回复“同意 R-254”。

## 5. 验收标准

- [ ] AC-1: 重复传 `--skip-skill-review A --skip-skill-review B --reason ...` 不再 crash，并能正确归并为两个 skip。
- [ ] AC-2: `--skip-skill-review` 非字符串/缺值输入输出明确参数错误，不出现 `item.split is not a function`。
- [ ] AC-3: 单次逗号分隔 `--skip-skill-review A,B` 仍兼容。
- [ ] AC-4: `review --scope last_commit --dry-run` 不再出现 `fatal: invalid --pretty format`，并能审查最近一次 commit 的变更文件。
- [ ] AC-5: `write-review-skill --scope last_commit` 使用同样合法的文件收集逻辑。
- [ ] AC-6: 相关 targeted tests 和 DocPath check/review 通过，或记录明确非本任务阻塞项。
