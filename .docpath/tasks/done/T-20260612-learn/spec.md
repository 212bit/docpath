# T-20260612-learn - 修复 learn 低信号过滤与智能规则分类

> backlog_id: R-157
> backlog_source: docpath backlog add

## 1. 背景与动机

`docpath learn` 当前会把 `完成 N/N 步，阻塞 N 步` 这类 journal 流水统计误识别为可沉淀经验，并已将低信号内容写入 `.docpath/rules/style.md` 的 auto-learn 区域。现有 `style.md` 已明确长期规则沉淀标准：只保留可复用、可执行、能降低未来错误概率的经验；流水统计只能留在 journal/archive；规则描述必须包含触发条件、期望行为和边界。

本任务修复 learn 的候选过滤与分类逻辑，清理当前误归档规则，并保证执行后不会因为已处理候选继续阻塞 `docpath next --agent`。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `learn` 必须过滤 `完成 N/N 步`、`阻塞 N 步`、`推荐保留本次任务的执行经验` 等低信号统计或口号型 lesson。
- [ ] FR-2: `learn` 在非 dry-run 执行后必须清理已处理的 `.docpath/workspace/lesson-candidates.md`，避免 next 反复推荐 learn。
- [ ] FR-3: 清理 `.docpath/rules/style.md` 当前 auto-learn 区域中第 25-28 行对应的低信号内容，只保留高信号长期规则。
- [ ] FR-4: `learn` 应能从候选 lesson 中提取或验证可复用规则的触发条件、期望行为和边界。
- [ ] FR-5: `learn` 应自动分类候选为 `保留`、`归档`、`跳过`，并在 dry-run 输出中展示分类统计和原因摘要。

### 非功能需求
- [ ] NFR-1: 保持现有 DocPath 工作流、`learn --dry-run`、`learn --from-journal` 和 auto-learn marker 的兼容性。
- [ ] NFR-2: 默认实现不依赖网络或外部 LLM API；LLM 判断由宿主 Agent/规则化结构承接，CLI 提供确定性、可测试的本地分类接口。
- [ ] NFR-3: 新增行为必须有自动化测试或等价本地验证覆盖。

## 3. 范围界定

### 包含
- 修改 `src/commands/learn.ts` 的候选解析、低信号过滤、规则质量判断、分类统计和执行后清理。
- 补充或调整 `tests/learn.test.mjs` 覆盖低信号过滤、候选清理、dry-run 分类预览和高信号规则保留。
- 清理 `.docpath/rules/style.md` 的错误 auto-learn 内容。
- 清空当前 `.docpath/workspace/lesson-candidates.md`。

### 不包含
- 不新增外部 LLM SDK、网络调用、API key 配置或远程推理依赖。
- 不重写 journal 生成候选的完整管线，除非 learn 测试暴露最小必要的兼容修复。
- 不改变 style/architecture 规则文件的 marker 协议。

### 待确认
- 用户提出“用 LLM 判断 lesson 是否可复用”。本任务推荐解释为：由宿主 Agent 或未来 LLM 层按照结构化规则做判断，当前 CLI 先实现可测试的确定性智能判断；若要让 CLI 直接调用外部 LLM，需要另立任务评估配置、安全、成本和离线可用性。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 智能判断落地方式 | CLI 内嵌外部 LLM / 本地确定性分类 + 宿主 Agent 判断 | 采用本地确定性分类 + 宿主 Agent 判断 | 仓库已有 `src/llm/client.ts` 标注 CLI 为 prompt-only；本地分类可测试、离线稳定，不引入密钥和网络风险 |
| 2 | 低信号候选处理 | 写入 rules / 留在 candidates / 归档或跳过并清理候选 | 归档或跳过并清理候选 | `style.md` 已明确流水统计只能留在 journal/archive，不应进入长期 rules |
| 3 | 规则质量标准 | 只按关键词保留 / 要求触发条件、期望行为、边界 | 要求三要素 | 可降低未来误归档概率，符合长期规则高信号约束 |

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
- [x] 长期维护成本增加
- [ ] 其他

### Decision Brief
- 当前问题: `learn` 会把低信号流水统计写入长期 rules，并保留候选导致后续路线反复提示 learn。
- 目标: 让 `learn` 只沉淀高信号、可复用、可执行的规则，并清理已处理候选。
- 背景: `style.md` 已定义长期规则标准，但实现未按该标准过滤。
- 可选方案: 继续关键词提取；CLI 直接调用外部 LLM；实现本地确定性分类并保留宿主 Agent/未来 LLM 扩展点。
- 推荐方案: 实现本地确定性分类，按触发条件、期望行为、边界判断高信号 lesson；低信号项归档或跳过，非 dry-run 后清理候选。
- 不做什么: 不新增外部 LLM SDK、网络调用或密钥配置；不改变 rules marker 协议。
- 成本: 需要调整 learn 解析/输出与测试，后续维护分类规则。
- 风险: 过滤过严可能漏掉简短但有价值的 lesson；通过测试覆盖和原因输出降低排查成本。
- 回滚方案: 回退 `src/commands/learn.ts` 与 `tests/learn.test.mjs` 相关变更，并恢复清理前候选内容。
- 用户确认: 2026-06-12 用户明确要求“新增backlog 并且推进”，并指定修复 learn 低信号过滤、清理误归档规则、增强智能判断。

## 5. 验收标准

- [ ] AC-1: `docpath learn --dry-run` 对当前低信号候选显示为跳过或归档，不再提示可新增长期 rules。
- [ ] AC-2: `docpath learn` 非 dry-run 后清空 `.docpath/workspace/lesson-candidates.md` 的已处理候选。
- [ ] AC-3: `.docpath/rules/style.md` 不再包含 `完成 6/6 步，阻塞 0 步` 或 `推荐保留本次任务的执行经验` 这类低信号 auto-learn 内容。
- [ ] AC-4: 高信号 lesson 只有在具备触发条件、期望行为、边界时才写入长期 rules；缺失三要素时进入归档或跳过。
- [ ] AC-5: 测试覆盖低信号过滤、执行后清理、dry-run 分类统计和高信号保留路径。

## 6. 风险与依赖

- `learn --from-journal` 与 lesson-candidates 两条入口需要保持一致的质量判断，否则仍可能产生误归档。
- 当前 CLI 已废弃内嵌 LLM；若强行接入外部 LLM，会引入网络、密钥、费用和测试稳定性风险。
- 清空候选文件必须只发生在非 dry-run 且候选已处理之后，避免 dry-run 造成状态变化。

## 7. 后续工作流

- 运行 `docpath plan` 生成执行计划。
- 运行 `docpath agent enter` 后开始执行。
- 每个子任务完成后运行 `docpath agent step --step "<step>"`。
- 完成实现后运行 `docpath check`、`docpath review` 或 `docpath agent done`。
