# DocPath — Claude Code Agent Protocol

> **Document as FSM** — 所有任务状态以 YAML frontmatter 形式存储在 Markdown 文件中。

## 快速开始

```bash
docpath init          # 初始化 .docpath 目录
docpath go <task>     # 开始新任务
docpath continue      # 继续当前任务
docpath status        # 查看当前状态
docpath context       # 查看上下文 (current + breadcrumb)
docpath check         # 任务前检查
docpath link <dep>    # 声明依赖
```

## 工作流

1. **开始任务**: `docpath go "描述任务"` → 读取 `.docpath/workspace/current.md` 获取状态
2. **执行中**: 每完成一步，更新 current.md 的 state + current_step
3. **状态转换**: planning → spec_ready → executing → done/blocked
4. **完成**: `docpath archive` 归档到 tasks/

## 文件结构

```
.docpath/
├── workspace/
│   ├── current.md      # 当前状态 (FSM 状态机)
│   └── breadcrumb.md   # 执行日志 (追加式)
├── tasks/              # 任务存档
├── journal/            # 决策日志
├── skills/             # 技能模板
├── workflows/          # 工作流模板
└── config.yaml         # 项目配置
```

## 关键规则

- **必须先读 current.md** 再开始任何操作
- 每次操作后必须更新 state 和 current_step
- 所有变更必须记录到 breadcrumb.md
- 失败时记录到 journal/ 以便分析
