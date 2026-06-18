## 1. 信息架构与页面清单

本任务不涉及 Web 页面，UI 表面是终端 CLI。信息架构为：项目检测摘要 -> 初始化决策问题 -> 执行结果 -> 下一步命令。getting started 文档是辅助信息架构，按“安装/初始化/第一个任务/验证/常见问题”组织。

## 2. 关键流程/线框描述

`docpath init --interactive` 终端流程建议：

1. 标题：DocPath interactive init。
2. 检测摘要：项目名、语言、框架、自动推荐 level。
3. Level 选择：0/1/2/3，默认自动检测值。
4. 已存在 `.docpath` 时：选择“只注册现有项目”或“强制重建”。默认只注册，避免破坏工作区。
5. 初始化执行：复用现有输出。
6. 下一步摘要：显示 `docpath status --agent`、`docpath backlog add ...`、可选 `docpath install --target codex`。

## 3. 组件、状态、表单与校验

终端交互组件：
- `select`：选择 level、已有项目处理方式。
- `confirm`：确认 force 覆盖。
- `text` 可选：MVP 不强制让用户编辑项目名，避免新增 config 修改复杂度。

校验：
- level 必须为 0-3。
- 非 TTY 环境不显示 prompt，直接报错并给替代命令。
- 用户取消 prompt 时 fail-loud，说明未写入文件。

## 4. 空态/错误/加载/权限态

- 空态：未检测到项目类型时仍允许初始化，提示使用 Level 1 或 2。
- 错误态：`.docpath` 已存在、link 目标无 `.docpath`、非法 level、非 TTY interactive 都要给修复建议。
- 加载态：项目检测和写文件较快，无需 spinner；输出步骤即可。
- 权限态：写入失败沿用底层错误，但应包含目标路径和 `--cwd` 提示。

## 5. 响应式、可访问性与文案

终端无需响应式布局，但应避免长行过宽；中文文案要短，命令用独立行展示。交互问题要有默认选项，减少键盘操作。所有交互路径必须有非交互等价命令，方便 CI、Agent 和屏幕阅读器用户使用。
