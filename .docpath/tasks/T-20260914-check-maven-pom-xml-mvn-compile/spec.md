# T-20260914-check-maven-pom-xml-mvn-compile - check 接入 Maven 编译检查（pom.xml → mvn compile）

> backlog_id: R-348
> backlog_source: docpath backlog add

## 1. 背景与动机

docpath check 的 runCompileChecks（src/commands/check/runners.ts:390-412）仅识别 tsconfig.json/Cargo.toml/go.mod，无 pom.xml/build.gradle 分支；runPackageScriptChecks 依赖 package.json，Java 项目全跳过。Java 项目 results 为空数组，check.ts:343 空数组 every() 返回 true → check exit 0 空洞通过，agent 误把 check 通过当编译没问题，需手工 mvn compile。Maven/Gradle 探测已有现成实现（src/utils/scan-existing-commands.ts:142-148）但 check 未接入。

## 2. 需求清单

### 功能需求
- [ ] FR-1: check 接入 Maven 编译检查（pom.xml → mvn compile）
  - 来源 backlog: R-348

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- check 接入 Maven 编译检查（pom.xml → mvn compile）

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
- 当前问题: docpath check 的 runCompileChecks（src/commands/check/runners.ts:390-412）仅识别 tsconfig.json/Cargo.toml/go.mod，无 pom.xml/build.gradle 分支；runPackageScriptChecks 依赖 package.json，Java 项目全跳过。Java 项目 results 为空数组，check.ts:343 空数组 every() 返回 true → check exit 0 空洞通过，agent 误把 check 通过当编译没问题，需手工 mvn compile。Maven/Gradle 探测已有现成实现（src/utils/scan-existing-commands.ts:142-148）但 check 未接入。
- 目标: check 接入 Maven 编译检查（pom.xml → mvn compile）
- 背景: 来自 backlog R-348
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明的全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 用户在会话中明确同意接入方案：runCompileChecks 加 pom.xml → mvn -q compile 分支，修复 Java 项目 check 零检查空洞通过（exit 0）

## 5. 验收标准

- [ ] AC-1: 1) pom.xml 项目 runCompileChecks 产出「Java 编译 (Maven)」检查项（mvn -q compile，heavy 超时）；2) mvn 缺失时按 environment_failure 诊断而非静默通过；3) evidence 零检查警告文案补 pom.xml；4) tests/check-maven-compile.test.mjs 锁定分支结构契约（已先行实现并通过定向验证）；5) 全量 check 门禁通过
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-348 与任务 T-20260914-check-maven-pom-xml-mvn-compile 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
