# T-20260726-lock-stale-unlink - lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态

> backlog_id: R-293
> backlog_source: docpath backlog add

## 1. 背景与动机

2026-07-26 架构 review 发现 lock.ts 两处竞态（withLock 是 R-286 后全部状态写入的互斥基石，缺陷影响面随之放大）：

1. stale 抢占（lock.ts:113-121）：等待者判定 stale 后 `unlink(lockPath)` 再重试。两个等待者 A/B 都判定 stale 时：A unlink → A tryAcquire 成功持锁（新锁文件）；B 随后 unlink 删掉的是 A 的**新锁**（unlink 按路径不按 inode）→ B/第三方随即获锁 → 双持有，互斥失效。
2. finally 释放（lock.ts:131-139）：无属主校验直接 `unlink(lockPath)`。若自己持锁超过 staleMs 被他人抢占重建，finally 会误删**他人的**锁 → 连锁双持有。

1. 锁记录加随机 token（crypto.randomUUID）：LockRecord {pid, ts, token}。
2. 释放属主校验：finally 先读锁文件比对 token（旧格式无 token 按 pid 回退兼容），匹配才 unlink；不匹配说明已被抢占，跳过。
3. stale 抢占改「原子夺锁」：unlink 改为 rename(lockPath → lockPath.stale-<token>)——rename 对同一路径原子，仅一个等待者成功；成功者清理改名文件后进入 tryAcquire，失败者（ENOENT）直接重试。消除双 unlink 窗口。

## 2. 需求清单

### 功能需求
- [ ] FR-1: lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
  - 来源 backlog: R-293

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 2026-07-26 架构 review 发现 lock.ts 两处竞态（withLock 是 R-286 后全部状态写入的互斥基石，缺陷影响面随之放大）：
- 目标: lock 属主校验与原子 stale 夺锁: 修复双 unlink 与无属主释放两处互斥失效竞态
- 背景: 来自 backlog R-293
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 待确认

## 5. 验收标准

- [ ] AC-1: 被 stale 抢占后，原持有者 fn 结束的释放不删除新持有者的锁（属主校验回归测试）。
- [ ] AC-2: N 个等待者并发抢占同一 stale 锁，互斥保持（并发 RMW 无 lost update，含初始 stale 锁场景）。
- [ ] AC-3: 旧格式锁文件（无 token）兼容：正常释放/判 stale 行为不变；现有 lock 套件全绿。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-293 与任务 T-20260726-lock-stale-unlink 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
