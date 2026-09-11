## 执行计划

### S1: 梳理 CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦)
- [x] S1: 梳理 CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦)
- **描述**: 根据 spec 明确 FR-1: CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦) 的实现边界和验收口径。
- **验收条件**: AC-1: emitNextHint 末行非空且为 exit_criteria（单测捕获 console 验证）。
- **依赖**: 无

### S2: 实现 CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦)
- [x] S2: 实现 CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦)
- **描述**: 在现有架构内完成 FR-1: CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦) 的代码与文档更新。
- **验收条件**: FR-1 CLI 输出契约: 末行有意义+换行参数 fail-loud+promote 提示修正 (体感三摩擦) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: emitNextHint 末行非空且为 exit_criteria（单测捕获 console 验证）。；AC-2: 换行参数命令非零退出并给出替代通道提示。；AC-3: 成熟度错误文案以 --body-file 为首选路径；相关既有断言同步。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-303 与任务 T-20260726-cli-fail-loud-promote 建立双向关联
- **验收条件**: AC-1: emitNextHint 末行非空且为 exit_criteria（单测捕获 console 验证）。；AC-2: 换行参数命令非零退出并给出替代通道提示。；AC-3: 成熟度错误文案以 --body-file 为首选路径；相关既有断言同步。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-303 与任务 T-20260726-cli-fail-loud-promote 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
