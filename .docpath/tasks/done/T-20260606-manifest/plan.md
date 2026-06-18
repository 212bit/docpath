## 执行计划

### S1: 设计安装资产 manifest 结构
- [x] S1: 设计安装资产 manifest 结构
- **描述**: 明确 managed asset manifest 的字段、覆盖范围和与现有 metadata 的兼容策略。
- **验收条件**: manifest 结构覆盖 path、source、sha256，并明确记录入口协议、命令模板和 agent 配置资产。
- **依赖**: 无

### S2: 实现 manifest 写入与 status 漂移提示
- [x] S2: 实现 manifest 写入与 status 漂移提示
- **描述**: install 写入 assets manifest，status 重新计算当前 CLI 期望资产并提示漂移或缺失。
- **验收条件**: `.install-meta.json.assets` 可生成；模板内容变化时 `docpath status` 提示资产漂移和 install 建议。
- **依赖**: S1

### S3: 补充回归测试并通过门禁
- [x] S3: 补充回归测试并通过门禁
- **描述**: 增加 install/status 测试，运行全量测试与 DocPath check/review/journal。
- **验收条件**: `pnpm test`、`docpath check`、`docpath review` 全部通过。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
