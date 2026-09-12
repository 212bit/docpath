# Protocol Shared Contract Blocks (R-300 / R-341)

共享契约段的唯一手写源。flavor canonical（templates/protocols/*.md）中以
`<!-- docpath:block <name> -->` … `<!-- /docpath:block -->` 标记的注入区由
`docpath render --view protocols` 从本目录重渲染；`docpath check` 校验注入区
与块源一致（漂移 fail-loud 指向 render，不自动写盘）。

## 块清单与覆盖面 (R-341)

确立 AGENTS.md 为唯一完备真源，CLAUDE.md 与 CODEX.md 降级为瘦代理（<30 行）指向 @AGENTS.md，不再包含注入块。

| 块 | 注入 flavor | 选择退出 / 代理模式 |
|----|-------------|-------------------|
| lifecycle-commands | AGENTS | OPENCODE（保留分阶段 walkthrough 变体）；CLAUDE / CODEX（瘦代理指向 @AGENTS.md） |
| worktree-isolation | AGENTS, OPENCODE | CLAUDE / CODEX（瘦代理指向 @AGENTS.md） |

修改共享契约语义时：改本目录块源 → `docpath render --view protocols` →
对选择退出的 flavor 人工核对对应段落。
