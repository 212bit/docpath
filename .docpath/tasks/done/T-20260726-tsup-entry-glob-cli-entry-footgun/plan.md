## 执行计划

### S1: 梳理 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- [x] S1: 梳理 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- [x] S1: 梳理 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- **描述**: 根据 spec 明确 FR-1: tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun 的实现边界和验收口径。
- **验收条件**: AC-1: tsup.config.ts 无手工 entry 白名单；任意 src 文件构建后在 dist 有对应产物（金丝雀断言）。
- **依赖**: 无

### S2: 实现 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- [x] S2: 实现 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun
- **描述**: 在现有架构内完成 FR-1: tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun 的代码与文档更新。
- **验收条件**: FR-1 tsup entry glob 全量编译, 根除 CLI_ENTRY 白名单与测试导入 footgun 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: tsup.config.ts 无手工 entry 白名单；任意 src 文件构建后在 dist 有对应产物（金丝雀断言）。；AC-2: 全量测试套件（pnpm test 等价路径）全绿；CLI bin(dist/index.js) 行为不变。；AC-3: 构建耗时无量级回归（秒级内）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-295 与任务 T-20260726-tsup-entry-glob-cli-entry-footgun 建立双向关联
- **验收条件**: AC-1: tsup.config.ts 无手工 entry 白名单；任意 src 文件构建后在 dist 有对应产物（金丝雀断言）。；AC-2: 全量测试套件（pnpm test 等价路径）全绿；CLI bin(dist/index.js) 行为不变。；AC-3: 构建耗时无量级回归（秒级内）。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-295 与任务 T-20260726-tsup-entry-glob-cli-entry-footgun 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
