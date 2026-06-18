## 1. 必问问题（阻塞 spec）

无。用户已明确要求新增 backlog 并执行，范围可按 MVP 假设推进。

## 2. 可延后问题（不阻塞 MVP）

- interactive 是否应进一步支持安装 Agent 协议文件并直接调用 `docpath install`。
- getting started 是否需要覆盖 Claude/Codex/OpenCode 三类适配器差异。
- 错误提示是否要推广成全局错误格式规范。

## 3. 需要用户/业务确认的假设

- MVP 只让 `init --interactive` 处理 level 和已有项目处理方式，不在本任务中实现完整项目配置编辑器。
- Agent 协议安装在本任务中作为下一步命令提示，不默认执行写操作。
- 文档路径可采用 `docs/getting-started.md`，如果仓库没有 docs 目录则创建。

## 4. 需要实验验证的问题

- PTY 下 `@clack/prompts` 的测试稳定性。
- 新错误提示是否会影响现有测试断言。
- getting started 示例是否与当前 CLI 参数完全一致。
