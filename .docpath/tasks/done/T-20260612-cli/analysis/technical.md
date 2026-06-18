## 1. 架构影响与模块边界

受影响模块：
- `src/commands/init.ts`：增加 interactive 分支、错误提示 helper、复用现有初始化函数。
- `src/commands/register/core.ts`：注册 `--interactive` 参数并传入 initCommand。
- `tests/init.test.mjs`：覆盖交互式初始化、非 TTY fail-loud、普通 init 不回归。
- docs 路径：新增 getting started guide，优先放在 `docs/getting-started.md` 或仓库既有文档目录。

边界：不修改状态机，不改变 `docpath init` 默认行为，不把 install 命令嵌入 init 写操作。

## 2. 数据模型/API/事件契约

`InitOptions` 需要新增 `interactive?: boolean`。CLI 参数契约新增 `--interactive`。内部可增加 `runInteractiveInit`，返回 `{ level, force }` 或直接调用现有 init flow。

输出契约：错误提示仍走 stdout/stderr 文本，不新增 JSON API。

## 3. 依赖、迁移与兼容性

`@clack/prompts` 已存在于依赖中，check.ts 已使用 `select` 和 `isCancel`，因此不需要新增依赖。普通 `init --level`、`init --link`、已有项目注册路径必须保持兼容。非 TTY 测试不能挂起。

## 4. 测试策略与质量门禁

- 单元/CLI 测试：普通 init；interactive 非 TTY 失败；interactive TTY 选择默认 level 初始化；已有 `.docpath` interactive 默认注册不覆盖。
- 文档测试：至少通过文件存在和关键命令字符串断言，避免示例漂移。
- 全量验证：`pnpm run typecheck`、`node --test tests/init.test.mjs`、必要时 `pnpm test`。

## 5. 安全、性能与运维风险

安全风险主要是 force 覆盖已有 `.docpath`，必须默认不覆盖并要求确认。性能影响很小。运维风险是交互模式在 CI 中阻塞，必须检测 TTY 并 fail-loud。
