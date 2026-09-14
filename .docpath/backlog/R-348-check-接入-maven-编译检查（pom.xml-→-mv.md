---
id: R-348
title: check 接入 Maven 编译检查（pom.xml → mvn compile）
status: proposed
priority: P1
level: 1
source: docpath backlog add
readiness: confirmed
evidence:
  brainstorm: null
  analysis: null
  spec: null
  decision_brief: null
  user_confirmed: 用户在会话中明确同意接入方案：runCompileChecks 加 pom.xml → mvn -q compile 分支，修复
    Java 项目 check 零检查空洞通过（exit 0）
links:
  task: null
  spec: null
created_at: 2026-09-14
---

## 背景

docpath check 的 runCompileChecks（src/commands/check/runners.ts:390-412）仅识别 tsconfig.json/Cargo.toml/go.mod，无 pom.xml/build.gradle 分支；runPackageScriptChecks 依赖 package.json，Java 项目全跳过。Java 项目 results 为空数组，check.ts:343 空数组 every() 返回 true → check exit 0 空洞通过，agent 误把 check 通过当编译没问题，需手工 mvn compile。Maven/Gradle 探测已有现成实现（src/utils/scan-existing-commands.ts:142-148）但 check 未接入。

## 验收

1) pom.xml 项目 runCompileChecks 产出「Java 编译 (Maven)」检查项（mvn -q compile，heavy 超时）；2) mvn 缺失时按 environment_failure 诊断而非静默通过；3) evidence 零检查警告文案补 pom.xml；4) tests/check-maven-compile.test.mjs 锁定分支结构契约（已先行实现并通过定向验证）；5) 全量 check 门禁通过
