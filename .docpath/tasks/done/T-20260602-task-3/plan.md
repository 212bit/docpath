## 执行计划

### S1: 确认夹具目录去留
- [x] S1: 确认夹具目录去留
- **描述**: 复核 temp-test 与 e2e-test 的文件结构、引用和用途，确认删除/保留清单。
- **验收条件**: temp-test 判定为历史临时残留，e2e-test 判定为保留示例项目。
- **依赖**: 无

### S2: 删除 temp-test
- [x] S2: 删除 temp-test
- **描述**: 删除被 Git 跟踪的 temp-test 目录内容，保留 e2e-test 不变。
- **验收条件**: git status 显示 temp-test 文件删除，e2e-test 仍存在。
- **依赖**: S1

### S3: 验证并归档
- [x] S3: 验证并归档
- **描述**: 运行 pnpm test 和 docpath check，并完成 review/journal。
- **验收条件**: 测试、门禁和审查通过。
- **依赖**: S2

## 依赖关系图
S1 -> S2 -> S3