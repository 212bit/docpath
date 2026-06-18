# T-20260601-backlog-add-id - backlog add 分配 ID 时避免并发重复

> backlog_id: R-043
> backlog_source: dogfood: 并发吸收 DocPath 优化项时发现

## 1. 背景与动机

并发执行多个 `docpath backlog add` 时，多个进程会同时读取相同最大 ID，导致新文件都写入相同 `id`。
这会让 `.docpath/backlog/*.md` 中出现多个相同 frontmatter id，进而污染 `backlog.md` 和 `backlog list --agent`。
该问题会直接破坏 DocPath 吸收需求的可靠性，因此需要先修复 backlog ID 分配的并发安全。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath backlog add` 在多进程并发执行时必须为每个新条目分配唯一 `R-###`。
- [ ] FR-2: 并发创建后的 ID 必须基于现有最大编号单调递增，不得重复或覆盖已有条目。
- [ ] FR-3: `backlog.md` 与 `backlog list --agent` 不得输出由并发创建导致的重复 ID。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不引入外部依赖，使用本地文件系统机制完成互斥或原子保留。
- [ ] NFR-3: 异常退出后不应长期阻塞后续 `backlog add`。

## 3. 范围界定

### 包含
- backlog ID 分配与新条目文件创建路径
- 并发 `backlog add` 回归测试
- 当前 backlog 索引刷新后的唯一性验证

### 不包含
- 分布式文件系统锁语义
- backlog 状态机转移规则调整
- backlog promote/accept/done/drop 的业务语义调整

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 并发控制粒度 | 全局命令锁 / 仅 backlog add ID 保留 | 仅 ID 保留 | 最小化锁范围，避免影响其他 backlog 操作 |
| 2 | 实现方式 | 计数器文件 / 原子创建候选文件 / 锁文件 | 原子创建候选文件 | 不依赖额外状态文件，直接以目标条目文件创建成功作为 ID 占用证据 |

## 5. 验收标准

- [ ] AC-1: 并发执行 5 个 `docpath backlog add` 时生成 5 个不同 ID。
- [ ] AC-2: 并发创建后的 ID 都大于已有最大 ID，且按编号不重复。
- [ ] AC-3: `docpath backlog list --agent` 输出的 ID 集合无重复。
- [ ] AC-4: 目标测试、全量测试和 `docpath check` 通过。

---

*此文件由 `docpath backlog promote` 生成。*
