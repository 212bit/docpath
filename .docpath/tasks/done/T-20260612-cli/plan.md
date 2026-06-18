## 执行计划

### S1: 定义 init interactive 契约与测试夹具
- [x] S1: 定义 init interactive 契约与测试夹具
- **描述**: 梳理 `initCommand`、CLI 注册和现有 init 测试，确定 `InitOptions.interactive`、TTY/非 TTY 行为、level 校验、已有 `.docpath` 默认注册策略，并准备测试辅助方式。
- **验收条件**: 契约明确；测试计划覆盖普通 init、interactive 非 TTY、interactive TTY、已有项目不覆盖、文档关键命令。
- **依赖**: 无

### S2: 实现 init --interactive 与参数校验
- [x] S2: 实现 init --interactive 与参数校验
- **描述**: 修改 `src/commands/register/core.ts` 与 `src/commands/init.ts`，新增 `--interactive`，复用 `@clack/prompts` 提供 level 选择和已有项目处理策略；非 TTY 或取消时 fail-loud。
- **验收条件**: TTY 下可完成初始化；非 TTY 下输出替代命令并不写半成品；普通 `init --level` 和 `init --link` 行为不回归。
- **依赖**: S1

### S3: 改进初始化相关错误提示
- [x] S3: 改进初始化相关错误提示
- **描述**: 为 `.docpath` 已存在、link 目标未初始化、非法 level、interactive 非 TTY/取消等场景补充原因和修复建议。
- **验收条件**: 相关输出包含可执行修复命令；测试断言关键提示；不改变全局错误处理框架。
- **依赖**: S2

### S4: 补充 Getting Started 文档与示例
- [x] S4: 补充 Getting Started 文档与示例
- **描述**: 新增 `docs/getting-started.md`，覆盖安装/初始化、interactive 与非交互路径、第一个 backlog、accept/promote、plan/go/check 的最小闭环和常见问题。
- **验收条件**: 文档包含真实 CLI 命令；示例不依赖网络；测试或断言覆盖关键命令字符串。
- **依赖**: S2

### S5: 补充测试并运行聚焦验证
- [x] S5: 补充测试并运行聚焦验证
- **描述**: 扩展 `tests/init.test.mjs`，必要时新增文档测试；运行 typecheck、init 聚焦测试和相关测试。
- **验收条件**: `pnpm run typecheck` 通过；`node --test tests/init.test.mjs` 通过；新增文档测试通过。
- **依赖**: S2, S3, S4

### S6: DocPath 收口验证
- [x] S6: DocPath 收口验证
- **描述**: 运行必要的更广测试、`docpath check`、review 和 journal，确保任务可归档。
- **验收条件**: DocPath 质量门禁通过；plan/breadcrumb 无漂移；任务进入完成路径。
- **依赖**: S5

## 依赖关系图
S1 → S2 → S3 → S5 → S6
S2 → S4 → S5
