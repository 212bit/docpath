# T-20260619-install-force-manifest-manifest-drift - install 非 force 模式刷 manifest 却跳过写盘，造成永久 manifest drift

> backlog_id: R-208
> backlog_source: docpath backlog capture

## 1. 背景与动机

## 背景

在非 force 模式下（即没有指定 `--force` 时），`docpath install` 命令在检测到目标目录中的文件内容与模板存在差异时，会为了保护用户的本地修改而选择跳过（skip）写入该文件。
然而，在整个安装命令的最后，`writeInstallMetadata` 函数总是会基于最新的模板内容重新生成所有的资产元数据（包括最新的 sha256 校验和），并写入到 `.docpath/.install-meta.json` 中。

这就导致了一个严重的 Bug（永久 drift）：
1. 磁盘上的文件保留了旧的内容（因为被 skip 写入了）；
2. `.install-meta.json` 记录了最新的模板 hash 校验和；
3. 后续运行 `docpath check` 或 `docpath doctor` 时，计算磁盘文件的真实 hash 会与 `.install-meta.json` 中的最新 hash 不一致，从而判定该资产发生漂移（drift），并要求用户重新运行 `docpath install`；
4. 然而用户即使重新运行 `docpath install`，只要不带 `--force` 参数，该文件依然会被跳过写入，同时 `.install-meta.json` 也不会有任何纠正，导致永久陷入“提示漂移 -> install 依然跳过 -> 依然提示漂移”的死循环。

为了彻底解决此问题，我们应当确保 `.install-meta.json` 中记录的 assets hash 是磁盘上**实际写入**或**实际存在**的文件的 sha256 校验和，而不是盲目写入新模板的 hash。

## 验收

1. 非 force 模式下运行 `docpath install` 时，若因为文件存在差异而 skip 了写入，生成/更新 of `.install-meta.json` 里应记录该文件的实际 sha256（即当前磁盘上已有内容的 hash），而不是模板的 hash。
2. 当发生局部 skip 且更新了 `.install-meta.json` 后，再次运行 `docpath check`（或 `install --check`、`install --doctor`），不应再报 `install-manifest-drift` 错误，除非磁盘上的文件确实被用户手动再次改动。
3. 如果指定 `--force` 重新安装，所有文件会被成功覆盖，`.install-meta.json` 应记录最新模板的 hash。
4. 测试用例应能稳定覆盖此流程。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 修复非 force 模式下安装元数据生成逻辑：在 `writeInstallMetadata` 中，从本地磁盘读取每个期望安装的文件内容，并对实际存在的文件计算 sha256 进行记录，而非统一采用模板 expected 状态的哈希。
  - 来源 backlog: R-208
- [ ] FR-2: 增加针对该漂移修复的测试用例。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流及命令格式完全兼容。

## 3. 范围界定

### 包含
- 修改 `src/commands/install.ts` 的 `writeInstallMetadata` 逻辑。
- 保证测试文件 `tests/install.test.mjs`（或相关 install 测试文件）通过。

### 不包含
- 不修改其它无关的 git 状态机或生命周期命令。

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | hash 计算位置 | 在 `writeInstallMetadata` 中后置扫描磁盘 | 采用 | 实现最直接且鲁棒，不受 copyDir 还是 writeManagedFile 跳过条件的影响。 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [x] API / 数据契约
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

### Decision Brief
- 当前问题: 见背景。
- 目标: 修复永久 manifest drift 问题。
- 背景: 来自 backlog R-208。
- 可选方案:
  1) 在写入时跟踪哪些文件被 skip，并在内存中更新 meta 结构；
  2) 在安装完成后，从磁盘计算每个 asset 的实际 hash（更鲁棒）。
- 推荐方案: 方案 2。
- 不做什么: 不修改 CLI 接口行为。
- 成本: 低。
- 风险: 无明显风险。
- 回滚方案: 回滚此任务 commit。
- 用户确认: 待确认。

## 5. 验收标准

- [ ] AC-1: 在非 force 模式下因 drift 发生 skip 后，`docpath check` 与 `docpath doctor` 不会报 `install-manifest-drift` 错误。
- [ ] AC-2: `--force` 安装后，所有的 hash 与最新的模板匹配。

---

*此文件由 `docpath backlog promote` 生成。*
