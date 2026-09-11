## 执行计划

### S1: 梳理 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
- [x] S1: 梳理 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
- **描述**: 根据 spec 明确 FR-1: 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档 的实现边界和验收口径。
- **验收条件**: AC-1: journal 后全局 breadcrumb ≤200 条且输出裁剪报告；任务级 canonical 不受影响。
- **依赖**: 无

### S2: 实现 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
- [x] S2: 实现 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档
- **描述**: 在现有架构内完成 FR-1: 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档 的代码与文档更新。
- **验收条件**: FR-1 运行时工件轮转: 接线 breadcrumb 死机制 + trace 丢弃改月归档 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: journal 后全局 breadcrumb ≤200 条且输出裁剪报告；任务级 canonical 不受影响。；AC-2: trace 超窗后旧条目落月归档文件，主文件截回窗口，零丢弃。；AC-3: 全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-302 与任务 T-20260726-breadcrumb-trace 建立双向关联
- **验收条件**: AC-1: journal 后全局 breadcrumb ≤200 条且输出裁剪报告；任务级 canonical 不受影响。；AC-2: trace 超窗后旧条目落月归档文件，主文件截回窗口，零丢弃。；AC-3: 全量套件绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-302 与任务 T-20260726-breadcrumb-trace 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
