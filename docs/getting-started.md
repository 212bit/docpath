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

初始化后先读取当前路由建议。`next --agent` 已包含紧凑状态快照，
`status --agent` 只在显式查看状态、诊断漂移或状态变更后确认时使用：

```bash
docpath next --agent
```

`next --agent` 是只读的 advisory router，适合启动、恢复或状态不确定时使用。
它不是授权、锁或所有命令的必需前置。用户已经明确指定的确定性命令可以直接
执行；会修改状态的命令会自行重读状态并执行 gate。

如果你使用 Codex 项目技能或 Agent 协议，可以安装本仓库的项目级适配文件：

```bash
docpath install --target codex
```

安装后可以检查资产健康度：

```bash
docpath install --target codex --doctor
```

## 4. 创建第一个 Backlog

如果只是记录一个想法，先用 capture 捕获 raw backlog。raw 条目不能直接进入执行，需要后续 analyze/refine 后补齐成熟度证据：

```bash
docpath backlog capture \
  --title "改进 CLI 初始化体验" \
  --priority P1 \
  --level 2
```

如果需求已经具备背景和验收，可以创建 shaped backlog：

```bash
docpath backlog add \
  --title "改进 CLI 初始化体验" \
  --priority P1 \
  --level 2 \
  --background "首次使用者需要更清晰的初始化引导。" \
  --acceptance "用户可以初始化项目、查看下一步，并完成第一个任务闭环。"
```

level 2/3 条目进入执行池前，应先完成需求理解并把证据写回 backlog。没有当前任务时使用 dry-run/brainstorm 做分析预览，不要把 analysis 写入上一任务：

```bash
docpath brainstorm --dry-run --input "改进 CLI 初始化体验，补充 getting started，并保证默认 init 不回归。"
docpath analyze --dry-run --mode deep --content "改进 CLI 初始化体验，补充 getting started，并保证默认 init 不回归。"
docpath backlog edit R-001 \
  --readiness analyzed \
  --evidence-brainstorm "brainstorm dry-run: 已澄清用户、入口、范围和验收" \
  --evidence-analysis "analysis summary: 初始化入口与回归测试范围已明确"
```

接受一条成熟 backlog。把 `R-001` 替换成上一条命令输出的真实编号：

```bash
docpath backlog accept R-001
```

把已接受的 backlog 提升为当前任务：

```bash
docpath backlog promote R-001
```

## 4.1 全新项目导入

当用户只有 PPT 提取文本、接口文档、介绍文档、会议纪要或单份粗需求文档时，不要先拆成 backlog。先创建 project intake：

```bash
docpath project capture --title "New CRM" --file requirements.md --source-type requirements
docpath project analyze P-YYYYMMDD-new-crm --dry-run
docpath project brief P-YYYYMMDD-new-crm --dry-run
docpath project backlog P-YYYYMMDD-new-crm --confirm "用户确认进入 backlog 拆分"
```

project intake 是需求梳理流水线，不是开发任务入口。固定顺序是：

```text
capture 原始材料
-> analyze 六域分析
-> gap index / stakeholder questions / decision cards
-> brief 需求定稿候选 + 拍板门
-> confirmed backlog guidance
-> 手工审阅后创建普通 backlog 条目
```

project intake 会把原始材料保存在 `.docpath/project-intake/<id>/`。analysis 必须区分事实、假设、缺口和建议决策；每个缺口应标注 `blocking` / `can-mock` / `later`。brief 必须包含范围、不做什么、验收候选、待拍板决策和拍板人/确认依据。确认前不要自动创建可执行 backlog 项。

## 5. 写规格和计划

复杂任务 promote 成当前任务后，可以写入持久化 analysis。非 dry-run `analyze` 和 `write-analysis` 需要活跃任务，避免把新需求写回上一轮归档任务：

```bash
docpath analyze --mode deep --content "改进 CLI 初始化体验，补充 getting started，并保证默认 init 不回归。"
docpath write-analysis --section requirements --stdin
```

把分析结论写入任务证据后，编写或完善规格：

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

### 微型任务快车道

拼写修正、一行 bugfix、注释补充或低风险小调整可以使用 quick profile：

```bash
docpath quick "Fix typo in docs"
# 修改文件
docpath done
```

`docpath quick` 会创建轻量任务证据，不要求完整 spec/plan。`docpath done`
仍会运行 check；full review 会按 quick profile 自动跳过并写入审计记录。
如果改动涉及架构、核心协议、权限、迁移、CI/CD 或过多文件，quick closeout
会失败并要求升级到标准生命周期。

原子地认领/启动计划中的第一步：

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

`docpath journal` 默认**不**物理移动任务目录（对齐 `agent done`）：它推进状态、回填
backlog、写 lesson 候选与决策日志，但保留 `tasks/<id>/` 供 `docpath changes --agent`
closeout。物理归档（`tasks/<id>/` → `tasks/done/<id>/`）由收口后的 `docpath gc --force`
完成。知识记录写入 spec.md 用 `docpath write-journal`，**必须在归档前**运行（归档后
write-journal 会 fail-loud）。

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
