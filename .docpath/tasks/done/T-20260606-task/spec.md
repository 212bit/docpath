# T-20260606-task - 补齐版本号与安装资产同步检测

> backlog_id: R-085
> backlog_source: docpath backlog add

## 1. 背景与动机

Ferrum 项目同步 DocPath 新安装资产时暴露了一个问题：CLI 与项目安装记录都显示
`0.1.0`，但模板和命令资产已经发生变化，项目侧只能通过人工 diff 判断是否需要重新
`docpath install`。这会让多项目接入时缺少清晰的升级信号。

本任务补齐安装元数据与状态提示，让项目能直接看到“安装资产来自哪个 DocPath 版本”，
并在当前 CLI 版本与项目安装版本不一致时给出同步建议。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath install` 写入的 `.docpath/.install-meta.json` 必须使用当前 CLI 的真实 package 版本，不能硬编码版本号。
- [ ] FR-2: `docpath status` 在人类输出中展示安装资产版本，并在安装版本与当前 CLI 版本不一致时提示重新运行 `docpath install`。
- [ ] FR-3: 安装适配器测试覆盖 metadata 版本写入与 status 版本提示，避免后续模板升级再次失去检测信号。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不引入网络依赖；版本检测只基于本地 package 与 `.docpath/.install-meta.json`。

## 3. 范围界定

### 包含
- 修复 install metadata 版本来源
- 增加 status 的安装资产版本提示
- 增加针对 install/status 的回归测试

### 不包含
- 不实现 npm registry 最新版本查询
- 不强制覆盖项目已有协议文件
- 不实现模板内容 hash 级别的深度漂移检测

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 版本真源 | 硬编码 / package.json | package.json | 避免每次发布时遗漏 install.ts 内部常量 |
| 2 | 同步检测范围 | 本地版本 / 远端最新版本 / 模板 hash | 本地版本 | 当前网络不可作为门禁依赖，先给出稳定可验证信号 |

## 5. 验收标准

- [ ] AC-1: `docpath install` 生成的 `.docpath/.install-meta.json.docpathVersion` 等于当前 package 版本。
- [ ] AC-2: 当 `.docpath/.install-meta.json.docpathVersion` 落后于当前 CLI 版本时，`docpath status` 显示同步建议。
- [ ] AC-3: `pnpm test`、`docpath check`、`docpath review` 全部通过。

---

*此文件由 `docpath backlog promote` 生成。*
