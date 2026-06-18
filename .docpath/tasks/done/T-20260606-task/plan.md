## 执行计划

### S1: 明确版本同步检测口径
- [x] S1: 明确版本同步检测口径
- **描述**: 将 R-085 的占位需求收窄为本地可验证的版本元数据与 status 提示，不引入远端版本查询。
- **验收条件**: spec 明确版本真源、同步提示范围、包含/不包含项和 3 条验收标准。
- **依赖**: 无

### S2: 实现安装元数据与 status 版本提示
- [x] S2: 实现安装元数据与 status 版本提示
- **描述**: 让 install metadata 使用当前 package 版本，并让 status 展示安装版本与当前 CLI 版本差异。
- **验收条件**: install 不再硬编码 docpathVersion；status 能在版本不一致时提示运行 `docpath install`。
- **依赖**: S1

### S3: 补测试并通过门禁
- [x] S3: 补测试并通过门禁
- **描述**: 增加 install/status 回归测试，运行项目测试与 DocPath 门禁。
- **验收条件**: `pnpm test`、`docpath check`、`docpath review` 均通过。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
