# DocPath — Claude Code Agent Protocol

> 本协议文件是 Claude Code 侧的 DocPath 参考宪法。
> **单一真源原则**：以 `docpath status --agent` / `docpath next --agent` 和 `.docpath/workspace/*` 为运行时真源，不维护平行状态。

## 首要顺序

1. 先运行 `docpath status --agent` 或读取 `.docpath/workspace/current.md`
2. 再运行 `docpath next --agent`
3. 按 `recommended_command` 推进，而不是凭记忆猜下一步
4. 每完成一个步骤，使用 `docpath agent step`
5. 完成任务时，使用 `docpath agent done`

## Claude Slash Commands

安装 Claude 适配后，优先使用以下 `/docpath-*` 命令：

```text
/docpath-status
/docpath-next
/docpath-agent-enter
/docpath-agent-step S1
/docpath-agent-done task
/docpath-agent-handoff
/docpath-check
/docpath-review
/docpath-brainstorm
/docpath-plan
/docpath-go
/docpath-journal
/docpath-continue
/docpath-compact
/docpath-refine
```

这些命令都应指向同一个 `.docpath/` 真源。不要再维护另一套 Claude 专用状态文件。

## 生命周期命令

```bash
docpath agent enter                         # 进入 DocPath 管理会话
docpath agent step --step "<sub-task>"      # 完成一个子任务后记录 breadcrumb + 同步 plan
docpath agent done --step "<task>"          # 执行 check/review/journal 并结束任务
docpath agent handoff                       # 生成 compact-context.md 交接包
```

## 协议规则

- 禁止手工编辑 `state.json`、`current.md` 中的 `phase/gate/state`
- 禁止跳过 `status --agent` / `next --agent` 直接从记忆执行
- `plan.md` 与 `breadcrumb.md` 的同步应通过 CLI 命令完成
- 质量门禁失败时，优先遵循 `next --agent` 给出的恢复路线

## 有效命令范围

当前可依赖的核心命令包括：

```bash
docpath status --agent
docpath next --agent
docpath brainstorm
docpath refine
docpath write-spec
docpath plan
docpath write-plan
docpath go
docpath check
docpath review
docpath journal
docpath write-journal
docpath continue
docpath compact
docpath agent enter
docpath agent step
docpath agent done
docpath agent handoff
```

不要引用任何已移除、未实现或历史遗留的命令名称。
