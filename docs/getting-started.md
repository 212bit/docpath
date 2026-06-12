# DocPath Getting Started

这份指南覆盖从一个已有代码仓库开始，到完成第一个 DocPath 任务闭环所需的最小命令。示例默认你已经可以在终端运行 `docpath`。

## 1. 确认可用命令

```bash
docpath --help
```

如果你是在 DocPath 仓库本地开发 CLI，可以先构建并链接本地命令：

```bash
pnpm install
pnpm run build
pnpm link --global
docpath --help
```

## 2. 初始化项目

首次使用推荐显式交互式初始化：

```bash
docpath init --interactive
```

交互式初始化会检测当前项目类型、语言、框架和推荐复杂度级别，然后让你确认默认 level。已有 `.docpath/` 时，默认只把现有项目注册到本地项目中心，不覆盖已有工作区文件。

在 CI、脚本或 Agent 非交互环境中使用非交互命令：

```bash
docpath init --level 2
```

指定其他目录：

```bash
docpath init --cwd /path/to/project --level 2
```

如果当前目录已经存在 `.docpath/`，普通初始化默认不会覆盖，只会注册项目：

```bash
docpath init --cwd /path/to/project
```

只有确认要重新生成初始化文件时才使用 `--force`：

```bash
docpath init --cwd /path/to/project --force --level 2
```

关联一个已经初始化过的项目：

```bash
docpath init --link /path/to/initialized-project
```

## 3. 查看下一步

初始化后先读取当前状态和路由建议：

```bash
docpath status --agent
docpath next --agent
```

如果你使用 Codex 项目技能或 Agent 协议，可以安装本仓库的项目级适配文件：

```bash
docpath install --target codex
```

安装后可以检查资产健康度：

```bash
docpath install --target codex --doctor
```

## 4. 创建第一个 Backlog

先把需求放进 backlog，保持需求池和当前执行任务分离：

```bash
docpath backlog add \
  --title "改进 CLI 初始化体验" \
  --priority P1 \
  --level 2 \
  --background "首次使用者需要更清晰的初始化引导。" \
  --acceptance "用户可以初始化项目、查看下一步，并完成第一个任务闭环。"
```

接受一条 backlog。把 `R-001` 替换成上一条命令输出的真实编号：

```bash
docpath backlog accept R-001
```

把已接受的 backlog 提升为当前任务：

```bash
docpath backlog promote R-001
```

## 5. 写规格和计划

复杂任务先做开发前分析：

```bash
docpath analyze --mode deep --content "改进 CLI 初始化体验，补充 getting started，并保证默认 init 不回归。"
```

把分析结论写入任务证据后，编写规格：

```bash
docpath write-spec --stdin
```

生成或重写执行计划：

```bash
docpath plan
```

如果需要手工写入计划：

```bash
docpath write-plan --stdin
```

## 6. 执行任务

进入计划中的第一步：

```bash
docpath go --step S1
```

完成一个有意义的子任务后同步进度：

```bash
docpath agent step --step S1 --status done
```

继续看下一步路由：

```bash
docpath next --agent
```

## 7. 检查、审查和归档

执行质量门禁：

```bash
docpath check
```

执行审查：

```bash
docpath review
```

归档经验和任务证据：

```bash
docpath journal
```

Agent 场景下推荐用收口命令串起 check、review 和 journal：

```bash
docpath agent done
```

## 常见问题

### `docpath init --interactive` 在脚本里失败

交互式初始化需要 TTY。脚本、CI 和大多数非交互 Agent 环境应该使用：

```bash
docpath init --level 2
```

或指定目录：

```bash
docpath init --cwd /path/to/project --level 2
```

### `--level` 参数非法

level 只能是 `0|1|2|3`：

```bash
docpath init --level 2
```

### `.docpath/` 已存在

默认不会覆盖已有工作区。只注册项目：

```bash
docpath init --cwd /path/to/project
```

确认要重建时再使用：

```bash
docpath init --cwd /path/to/project --force --level 2
```

### `--link` 目标没有 `.docpath/`

先初始化目标项目：

```bash
docpath init --cwd /path/to/target --level 2
```

再关联：

```bash
docpath init --link /path/to/target
```
