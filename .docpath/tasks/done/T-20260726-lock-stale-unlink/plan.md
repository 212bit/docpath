## 执行计划

### S1: 梳理 lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
- [x] S1: 梳理 lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
- **描述**: 根据 spec 明确 FR-1: lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态 的实现边界和验收口径。
- **验收条件**: AC-1: 被 stale 抢占后，原持有者 fn 结束的释放不删除新持有者的锁（属主校验回归测试）。
- **依赖**: 无

### S2: 实现 lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
- [x] S2: 实现 lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
- **描述**: 在现有架构内完成 FR-1: lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态 的代码与文档更新。
- **验收条件**: FR-1 lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 被 stale 抢占后，原持有者 fn 结束的释放不删除新持有者的锁（属主校验回归测试）。；AC-2: N 个等待者并发抢占同一 stale 锁，互斥保持（并发 RMW 无 lost update，含初始 stale 锁场景）。；AC-3: 旧格式锁文件（无 token）兼容：正常释放/判 stale 行为不变；现有 lock 套件全绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-293 与任务 T-20260726-lock-stale-unlink 建立双向关联
- **验收条件**: AC-1: 被 stale 抢占后，原持有者 fn 结束的释放不删除新持有者的锁（属主校验回归测试）。；AC-2: N 个等待者并发抢占同一 stale 锁，互斥保持（并发 RMW 无 lost update，含初始 stale 锁场景）。；AC-3: 旧格式锁文件（无 token）兼容：正常释放/判 stale 行为不变；现有 lock 套件全绿。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-293 与任务 T-20260726-lock-stale-unlink 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
