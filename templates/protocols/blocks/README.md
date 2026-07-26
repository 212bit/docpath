# Protocol Shared Contract Blocks (R-300)

共享契约段的唯一手写源。flavor canonical（templates/protocols/*.md）中以
`<!-- docpath:block <name> -->` … `<!-- /docpath:block -->` 标记的注入区由
`docpath render --view protocols` 从本目录重渲染；`docpath check` 校验注入区
与块源一致（漂移 fail-loud 指向 render，不自动写盘）。

## 块清单与覆盖面

| 块 | 注入 flavor | 选择退出（需人工语义对齐） |
|----|-------------|---------------------------|
| lifecycle-commands | CLAUDE, CODEX, AGENTS | OPENCODE（保留分阶段 walkthrough 变体） |
| worktree-isolation | CLAUDE, CODEX, OPENCODE | AGENTS（无 worktree 章节） |

修改共享契约语义时：改本目录块源 → `docpath render --view protocols` →
对选择退出的 flavor 人工核对对应段落。
