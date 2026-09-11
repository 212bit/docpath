## 执行计划

### S1: 梳理 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
- [x] S1: 梳理 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
- **描述**: 根据 spec 明确 FR-1: 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理 的实现边界和验收口径。
- **验收条件**: AC-1: blocks 漂移 fixture 经环境覆盖可测：check 非零退出、含注入区错误、不含编译检查段落（早退证明）。
- **依赖**: 无

### S2: 实现 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
- [x] S2: 实现 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
- **描述**: 在现有架构内完成 FR-1: 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理 的代码与文档更新。
- **验收条件**: FR-1 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: blocks 漂移 fixture 经环境覆盖可测：check 非零退出、含注入区错误、不含编译检查段落（早退证明）。；AC-2: 入口三阶段为具名函数且调用顺序与契约注释一致。；AC-3: utils 全部文件在 README 分类内，完备性测试防未分类新增；全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-305 与任务 T-20260726-review-check-utils 建立双向关联
- **验收条件**: AC-1: blocks 漂移 fixture 经环境覆盖可测：check 非零退出、含注入区错误、不含编译检查段落（早退证明）。；AC-2: 入口三阶段为具名函数且调用顺序与契约注释一致。；AC-3: utils 全部文件在 README 分类内，完备性测试防未分类新增；全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-305 与任务 T-20260726-review-check-utils 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
