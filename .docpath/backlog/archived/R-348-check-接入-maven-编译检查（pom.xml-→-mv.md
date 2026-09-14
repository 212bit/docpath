---
id: R-348
title: check 接入 Maven 编译检查（pom.xml → mvn compile）
status: done
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: tasks/T-20260914-check-maven-pom-xml-mvn-compile/spec.md
  decision_brief: >-
    - 当前问题: docpath check 的
    runCompileChecks（src/commands/check/runners.ts:390-412）仅识别
    tsconfig.json/Cargo.toml/go.mod，无 pom.xml/build.gradle
    分支；runPackageScriptChecks 依赖 package.json，Java 项目全跳过。Java 项目 results
    为空数组，check.ts:343 空数组 every() 返回 true → check exit 0 空洞通过，agent 误把 check
    通过当编译没问题，需手工 mvn compile。Maven/Gradle
    探测已有现成实现（src/utils/scan-existing-commands.ts:142-148）但 check 未接入。

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

    - 用户确认: 用户在会话中明确同意接入方案：runCompileChecks 加 pom.xml → mvn -q compile 分支，修复
    Java 项目 check 零检查空洞通过（exit 0）
  user_confirmed: 用户在会话中明确同意接入方案：runCompileChecks 加 pom.xml → mvn -q compile 分支，修复
    Java 项目 check 零检查空洞通过（exit 0）
links:
  task: T-20260914-check-maven-pom-xml-mvn-compile
  spec: tasks/T-20260914-check-maven-pom-xml-mvn-compile/spec.md
created_at: 2026-09-14
---

## 背景

docpath check 的 runCompileChecks（src/commands/check/runners.ts:390-412）仅识别 tsconfig.json/Cargo.toml/go.mod，无 pom.xml/build.gradle 分支；runPackageScriptChecks 依赖 package.json，Java 项目全跳过。Java 项目 results 为空数组，check.ts:343 空数组 every() 返回 true → check exit 0 空洞通过，agent 误把 check 通过当编译没问题，需手工 mvn compile。Maven/Gradle 探测已有现成实现（src/utils/scan-existing-commands.ts:142-148）但 check 未接入。

## 验收

1) pom.xml 项目 runCompileChecks 产出「Java 编译 (Maven)」检查项（mvn -q compile，heavy 超时）；2) mvn 缺失时按 environment_failure 诊断而非静默通过；3) evidence 零检查警告文案补 pom.xml；4) tests/check-maven-compile.test.mjs 锁定分支结构契约（已先行实现并通过定向验证）；5) 全量 check 门禁通过
