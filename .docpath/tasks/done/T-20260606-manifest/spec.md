# T-20260606-manifest - 补齐安装模板资产 manifest 与漂移检测

> backlog_id: R-086
> backlog_source: docpath backlog add

## 1. 背景与动机

R-085 已经让项目能看到安装资产对应的 DocPath package 版本，但仍存在一个边界：
同一版本内如果模板或命令资产被本地开发版修改，项目侧只能看到版本一致，无法判断
是否需要重新运行 `docpath install`。

本任务补齐安装资产 manifest：安装时记录 DocPath 管理资产的目标路径与内容 hash；
`docpath status` 在人类输出中基于当前 CLI 模板重新计算期望 hash，并提示哪些资产存在
模板漂移或本地缺失。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath install` 在 `.docpath/.install-meta.json` 中写入 managed assets manifest，至少包含目标路径、sha256 和来源类别。
- [ ] FR-2: `docpath status` 在人类输出中对比当前 CLI 模板期望 hash 与安装 manifest，提示模板资产漂移或缺失。
- [ ] FR-3: install/status 测试覆盖 manifest 写入与同版本模板漂移提示。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不联网、不查询 npm registry，漂移检测只基于本地模板和已安装 metadata。
- [ ] NFR-3: 不改变非 `--force` 下保护用户已有文件的行为。

## 3. 范围界定

### 包含
- 为 install metadata 增加 assets manifest
- 为 status 增加 manifest 漂移提示
- 增加回归测试

### 不包含
- 不实现远端最新版本检测
- 不实现自动覆盖修复
- 不把用户自定义文件判定为错误，只提供同步提示

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 漂移检测依据 | 版本号 / asset hash manifest | asset hash manifest | 版本号无法识别同版本模板变更 |
| 2 | 修复策略 | status 自动修复 / 仅提示 install | 仅提示 install | 避免 status 改写用户文件 |

## 5. 验收标准

- [ ] AC-1: `docpath install` 生成的 `.install-meta.json.assets` 至少记录入口协议文件、命令模板和 agent 配置资产。
- [ ] AC-2: 当前 CLI 模板内容与安装 manifest 不一致时，`docpath status` 显示资产漂移提示和 `docpath install --target <target>` 建议。
- [ ] AC-3: `pnpm test`、`docpath check`、`docpath review` 全部通过。

---

*此文件由 `docpath backlog promote` 生成。*
