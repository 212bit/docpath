# T-20260726-tsup-entry-glob-cli-entry-footgun - tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun

> backlog_id: R-295
> backlog_source: docpath backlog add

## 1. 背景与动机

tsup.config.ts 维护 44 项手工 CLI_ENTRY 白名单，测试经 ../dist 导入的每个 src 文件必须列名，否则「构建成功但测试 ERR_MODULE_NOT_FOUND」（memory/rules 记录的既踩 footgun；本会话 R-286/R-287 均被迫补名单）。白名单与测试导入面的耦合是纯维护负担，且失败形态有欺骗性（build 绿、测试红、报错不指向根因）。

entry 改为 glob 全量 `src/**/*.ts`：全部 156 个源文件编译进 dist（esbuild 全量编译秒级，splitting 共享 chunk 保持单例语义），白名单与 footgun 一并消亡。不改测试运行器（node --test + dist 导入模式不变，CLI 子进程测试零影响，无 src/dist 偏斜风险）——目标是根除白名单耦合而非字面直跑 TS，方案对比记录于 Decision Brief。tests/build-scripts.test.mjs 加金丝雀断言：历史不在白名单内的文件（如 utils/plan-sync.js）构建后必须存在于 dist。

## 2. 需求清单

### 功能需求
- [ ] FR-1: tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
  - 来源 backlog: R-295

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun

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
- 当前问题: tsup.config.ts 维护 44 项手工 CLI_ENTRY 白名单，测试经 ../dist 导入的每个 src 文件必须列名，否则「构建成功但测试 ERR_MODULE_NOT_FOUND」（memory/rules 记录的既踩 footgun；本会话 R-286/R-287 均被迫补名单）。白名单与测试导入面的耦合是纯维护负担，且失败形态有欺骗性（build 绿、测试红、报错不指向根因）。
- 目标: tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- 背景: 来自 backlog R-295
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: tsup.config.ts 无手工 entry 白名单；任意 src 文件构建后在 dist 有对应产物（金丝雀断言）。
- [ ] AC-2: 全量测试套件（pnpm test 等价路径）全绿；CLI bin(dist/index.js) 行为不变。
- [ ] AC-3: 构建耗时无量级回归（秒级内）。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-295 与任务 T-20260726-tsup-entry-glob-cli-entry-footgun 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
