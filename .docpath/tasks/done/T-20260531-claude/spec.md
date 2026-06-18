# T-20260531-claude - 清理过时协议模板并统一 Claude 协议文案

> backlog_id: R-028
> backlog_source: docpath backlog add

## 1. 背景与动机

设计文档把 DocPath 定位为“多 Agent 共享的本地协议层”。这意味着不仅安装命令要能生成目标文件，协议模板本身也必须与当前 CLI 真相一致。  

当前仓库里存在明显漂移：

- `templates/CLAUDE.md` 已经描述了新的 agent 生命周期、`status/next --agent` 路由和 `/docpath-*` 命令；
- 但 `.docpath/protocols/CLAUDE.md` 仍然是旧版协议，包含 `docpath link`、`docpath archive`、旧状态流等已不存在或已过时的内容。

这种分裂会直接削弱安装体系和协议层的一致性：模板告诉 Agent 一套行为，协议目录里又保留另一套历史语义。  

本任务聚焦清理这些过时协议模板，统一 Claude 协议文案，并通过测试确保安装生成物和仓库内协议模板不再引用失效命令。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 清理或更新仓库内过时的 Claude 协议模板，使其不再引用失效命令（如 `docpath link`、`docpath archive`）。
- [ ] FR-2: Claude 协议模板应与当前 DocPath 生命周期约束一致，明确先读 `status --agent` / `next --agent`，再按 `agent step/done/handoff` 推进。
- [ ] FR-3: 安装相关测试需覆盖协议模板不再引用已移除命令，避免今后回归。
- [ ] FR-4: 如果 `.docpath/protocols/CLAUDE.md` 仍作为安装资产或参考资产存在，其内容必须与当前模板语义一致，而不是保留历史残片。

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容
- [ ] NFR-2: 不回归现有 `install` 相关测试与模板路径结构。
- [ ] NFR-3: 优先统一文案与命令真源，不额外引入新的协议分支。

## 3. 范围界定

### 包含
- Claude 协议模板与仓库内参考协议的统一
- 失效命令引用清理
- install / 模板测试补强

### 不包含
- 重写所有 Agent 模板的整体风格
- 扩展新的安装目标
- 大规模重构 install 目录布局

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | 协议统一策略 | 保留旧协议作历史遗留 / 统一到当前模板语义 | 统一到当前模板语义 | 多 Agent 协议层不能同时存在两套冲突真相 |
| 3 | 回归保护方式 | 只人工检查 / 增加自动化断言 | 增加自动化断言 | 协议模板属于长期资产，需要测试护栏 |

## 5. 验收标准

- [ ] AC-1: Claude 协议模板与 `.docpath/protocols/CLAUDE.md` 不再引用 `docpath link`、`docpath archive` 等失效命令。
- [ ] AC-2: 协议内容明确要求先读 `docpath status --agent` 或 `docpath next --agent`，再使用 agent lifecycle 命令推进。
- [ ] AC-3: install / 模板测试通过，并能自动防止旧命令引用回归。
- [ ] AC-4: 全量回归通过，DocPath 状态闭环。

---

*此文件由 `docpath backlog promote` 生成。*
