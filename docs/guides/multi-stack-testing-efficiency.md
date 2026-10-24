---
related:
  - features/test-impact-analysis.md
  - BUILD.md
---

# 多技术栈定向测试与门禁效能最佳实践

> 规范 DocPath 在不同语言与技术栈下的测试验证分工，杜绝调试期盲目跑全量测试导致的耗时增加与 Token 浪费，建立「调试期定向单测」与「收口期法定门禁」的高效双层体系。

---

## 1. 核心理念与分层设计

AI Agent 在辅助编码过程中，测试验证通常分为两个截然不同的阶段：

```
                    ┌────────────────────────────────────────────────────────┐
                    │ 阶段 1: 迭代调试期 (Coding / Debugging)                │
                    │ 目标: 验证局部代码正确性、看报错信息                   │
                    │ 方式: 定向运行单个测试文件 / 单个测试函数 (毫秒~秒级) │
                    └──────────────────────────┬─────────────────────────────┘
                                               │
                                               ▼
                    ┌────────────────────────────────────────────────────────┐
                    │ 阶段 2: 任务收口期 (Task Closeout)                     │
                    │ 目标: 全局法定门禁、静态类型检查、需求覆盖度盖章       │
                    │ 方式: 统一执行 docpath done / docpath check (全量 1 次)│
                    └────────────────────────────────────────────────────────┘
```

---

## 2. 跨技术栈测试命令对照表

| 技术栈 / 生态 | 识别标记 | 调试期：定向单测命令（毫秒~秒级） | 收口期：`docpath done` 自动执行 |
| :--- | :--- | :--- | :--- |
| **Node.js / TypeScript** | `package.json` | `node --test tests/foo.test.mjs`<br>`pnpm vitest run tests/foo.test.ts`<br>`jest tests/foo.test.js` | 本地 `tsc --noEmit` + `tsup` + 全量测试 |
| **Go** | `go.mod` | `go test -v ./pkg/foo/...`<br>`go test -run TestName ./...` | `go vet ./...` + `go test ./...` |
| **Rust** | `Cargo.toml` | `cargo test --test foo`<br>`cargo test test_fn` | `cargo clippy` + `cargo test` |
| **Python** | `pyproject.toml` / `requirements.txt` | `pytest tests/test_foo.py -k test_bar`<br>`python -m unittest tests/test_foo.py` | `pytest` / `flake8` / `mypy` |
| **Java** | `pom.xml` / `build.gradle` | `mvn test -Dtest=FooTest#testBar` | `mvn test` / `gradle test` |
| **通用 / 自定义** | `Makefile` / `config.yaml` | `make test-single TARGET=foo` | `make check` / `config.yaml` 配置的命令流水线 |

---

## 3. Agent 行动红线（Anti-Patterns）

1. **【严禁】调试期执行无参全量测试**：
   - 严禁在编码迭代、排查单点报错时执行 `node --test`、`go test ./...`、`cargo test` 等全套测试；这会使单个测试循环从 1 秒飙升至数十秒甚至数分钟。
2. **【严禁】收口门禁前后手动重复全量测试**：
   - `docpath check` 和 `docpath done` 本身就会运行全量测试并打印输出。严禁在运行 `docpath done` 之前或之后自行在终端手动再跑一次全量测试。
3. **【必须】善用 DocPath 门禁缓存**：
   - `docpath check` 会在成功后打上 `check_pass` 凭证与代码指纹。在代码未改动时，后续的 `docpath done` 会自动复用结果，跳过重复编译与测试。

---

## 4. TypeScript 编译命令（禁止 npx 联网安装）

存在 `tsconfig.json` 且 `package.json` 没有 `typecheck` 脚本时，`docpath check` 的编译检查只执行项目本地的 `tsc --noEmit`（`runCompileChecks`，`src/commands/check/runners.ts`）：

1. 解析当前工作区的 `node_modules/.bin/tsc`。
2. 若当前目录是 git worktree 且自身没有该二进制，再解析主检出的 `node_modules/.bin/tsc`（与 `checkCommandEnv` 注入 PATH 的目录相同）。
3. 两处都不存在时立即返回 `environment_failure`（且 `environment_exemptible`），**不派生进程**。

不会调用 `npx tsc`。npm 会把这个命令名当成包名 `tsc` 去注册表安装；该包不是 TypeScript 编译器。没有本地缓存或网络变慢时，安装会一直挂起，直到 check 或调用方超时。PATH 上的全局 `tsc` 也不参与这次解析，避免误用别的项目或全局安装。

有 `typecheck` 脚本时仍走脚本内联（例如 `tsc --noEmit`），不改用户自己写的命令。
