# T-20260606-install-manifest-check-only - 为 install manifest 漂移检测增加 check-only 模式

> backlog_id: R-087
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- 上一阶段已经为 `docpath install` 写入 `.docpath/.install-meta.json`，并在 `docpath status` 中提示安装资产 manifest 漂移。
- 现有漂移检测只面向人工查看状态，不能直接用于 CI、preflight 或发布前门禁。
- 需要在 `docpath install` 下增加只读检查模式，让用户可以验证已安装协议文件、命令模板和适配器配置是否仍与当前模板一致。

## 验收

- `docpath install --target <target> --check-only` 只检查安装资产 manifest 与本地文件，不写入、覆盖或修复任何文件。
- 没有漂移时命令退出码为 0，并输出安装资产一致的结果。
- 存在模板漂移、缺失文件、本地改动、manifest 缺失或 manifest 无法解析时命令退出码为 1，并输出可定位的分类摘要。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 为 `docpath install` 增加 `--check-only` 参数
  - 来源 backlog: R-087
- [ ] FR-2: `--check-only` 复用现有 manifest 漂移检测口径，覆盖模板漂移、缺失文件和本地改动
- [ ] FR-3: `--check-only` 根据漂移结果返回稳定退出码，便于 CI 或脚本调用
- [ ] FR-4: `--check-only` 输出 target、漂移分类计数和最多 3 个示例路径

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 检查逻辑应与 `docpath status` 共享，避免两套漂移判定口径
- [ ] NFR-3: check-only 路径必须无副作用，不修改协议文件、命令模板、hooks 或 `.install-meta.json`

## 3. 范围界定

### 包含
- `docpath install --check-only` CLI 参数注册与执行路径
- install manifest 漂移检测的结构化结果抽取
- `status` 与 `install --check-only` 共享检测逻辑
- 针对成功、漂移失败和无副作用的自动化测试

### 不包含
- 自动修复漂移或覆盖文件；修复仍通过现有 `docpath install --target <target>` / `--force` 完成
- 引入新的子命令形态，例如 `docpath install check`
- 改变 `.install-meta.json` 的持久化结构，除非测试证明必须补充兼容字段

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | check-only 命令形态 | `install --check-only` / `install check` | 采用 `install --check-only` | 符合 backlog 标题，改动范围小，并与现有 install 选项保持一致 |
| 3 | 漂移检测实现 | 复制 status 逻辑 / 抽取共享逻辑 | 抽取共享逻辑 | 避免 status 与 CI 检查口径分叉 |

## 5. 验收标准

- [ ] AC-1: `docpath install --target codex --check-only` 在资产一致时退出码为 0，输出资产一致信息
- [ ] AC-2: 篡改 `.install-meta.json` 中某个资产 hash 后运行 check-only，退出码为 1，输出模板漂移计数和示例路径
- [ ] AC-3: 修改本地已安装资产文件后运行 check-only，退出码为 1，输出本地改动计数
- [ ] AC-4: 缺失 `.install-meta.json` 或 manifest 无法解析时运行 check-only，退出码为 1，并提示重新运行 install
- [ ] AC-5: check-only 执行前后，已安装资产和 `.install-meta.json` 内容保持完全一致
- [ ] AC-6: `docpath status` 现有安装资产提示测试仍通过，且与 check-only 使用同一套漂移检测结果

---

*此文件由 `docpath backlog promote` 生成。*
