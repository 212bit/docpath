## 执行计划

### S1: 明确 learn 数据源优先级与预览语义
- [x] S1: 明确 learn 数据源优先级与预览语义
- **描述**: 梳理默认模式、from-journal 模式和 dry-run 之间的数据源选择、输出内容与不写盘约束。
- **验收条件**: 规则边界明确，兼容策略和测试场景确定。
- **依赖**: 无

### S2: 实现 --from-journal / --dry-run
- [x] S2: 实现 --from-journal / --dry-run
- **描述**: 扩展 learn CLI 参数和命令实现，支持显式从 journal 提取 lessons 与 dry-run 预览。
- **验收条件**: from-journal 与 dry-run 行为符合预期，默认模式不回归。
- **依赖**: S1

### S3: 补测试并回归验证
- [x] S3: 补测试并回归验证
- **描述**: 为默认模式、from-journal 和 dry-run 不写盘补测试，串行执行全量回归。
- **验收条件**: 新增测试通过，pnpm test 全绿。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
