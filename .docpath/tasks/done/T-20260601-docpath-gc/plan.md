## 执行计划

### S1: 梳理任务目录枚举与安全边界
- [x] S1: 梳理任务目录枚举与安全边界
- **描述**: 调查现有任务目录结构、active/current/done 的约定以及可复用的文件工具，确定 `gc` 的清理目标与保留边界。
- **验收条件**: 明确 `gc` 命令入口、默认行为和需要跳过的目录。
- **依赖**: 无

### S2: 实现 docpath gc 并补测试
- [x] S2: 实现 docpath gc 并补测试
- **描述**: 新增 `docpath gc` 或 `docpath tasks prune`，支持 dry-run / force / 预览输出，并补充回归测试防止误删 current 或 active 目录。
- **验收条件**: 命令可运行、测试覆盖预览与实际清理、完整测试与 `docpath check` 通过。
- **依赖**: S1

## 依赖关系图
S1 -> S2
