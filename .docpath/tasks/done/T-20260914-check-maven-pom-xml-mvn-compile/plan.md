## 执行计划

### S1: 实现并验证 check 接入 Maven 编译检查（pom.xml → mvn compile）
- [x] S1: 实现并验证 check 接入 Maven 编译检查（pom.xml → mvn compile）
- **描述**: 完成 FR-1: check 接入 Maven 编译检查（pom.xml → mvn compile），随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: 1) pom.xml 项目 runCompileChecks 产出「Java 编译 (Maven)」检查项（mvn -q compile，heavy 超时）；2) mvn 缺失时按 environment_failure 诊断而非静默通过；3) evidence 零检查警告文案补 pom.xml；4) tests/check-maven-compile.test.mjs 锁定分支结构契约（已先行实现并通过定向验证）；5) 全量 check 门禁通过；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-348 与任务 T-20260914-check-maven-pom-xml-mvn-compile 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
