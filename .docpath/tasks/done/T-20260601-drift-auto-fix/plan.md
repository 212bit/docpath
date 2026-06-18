## 执行计划

### S1: 定位漂移检测与路由入口
- [x] S1: 定位漂移检测与路由入口
- **描述**: 梳理 check、next、tasks sync 和 task-files 的现有调用关系，确定自动修复参数接入点。
- **验收条件**: 明确 fix-drift 与 auto-fix 的参数语义、错误边界和复用路径。
- **依赖**: 无

### S2: 实现显式漂移自动修复参数
- [x] S2: 实现显式漂移自动修复参数
- **描述**: 为 check 增加 fix-drift 参数，为 next 增加 auto-fix 参数，复用 syncActiveTaskFiles 并重建 current.md。
- **验收条件**: 漂移存在时可按指定方向修复，非法方向 fail-loud，无漂移时保持原行为。
- **依赖**: S1

### S3: 补充回归测试并完成门禁
- [x] S3: 补充回归测试并完成门禁
- **描述**: 覆盖 check/next 自动修复、非法参数、修复后继续路由与无漂移行为，运行测试、check、review 和 journal。
- **验收条件**: 新增测试和全量测试通过，docpath check 与 docpath review 通过。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
