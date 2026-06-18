## 执行计划

### S1: 明确 check-only 接口与退出码
- [x] S1: 明确 check-only 接口与退出码
- **描述**: 确认 `docpath install --check-only` 的只读语义、成功/失败退出码和输出摘要口径。
- **验收条件**: spec 明确 check-only 不写文件、无漂移返回 0、漂移返回非 0，并输出修复建议。
- **依赖**: 无

### S2: 实现 install manifest check-only
- [x] S2: 实现 install manifest check-only
- **描述**: 注册 `--check-only` 参数，复用 install manifest 漂移检测结果，并保留 `--check` 作为兼容别名。
- **验收条件**: `docpath install --target codex --check-only` 能检查 manifest；成功不写文件，失败输出分类摘要并返回非 0。
- **依赖**: S1

### S3: 补测试并通过门禁
- [x] S3: 补测试并通过门禁
- **描述**: 增加 check-only 成功/失败/无副作用测试，运行全量测试与 DocPath 门禁。
- **验收条件**: `pnpm test`、`docpath check`、`docpath review` 全部通过。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
