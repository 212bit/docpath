## 执行计划

### S1: 新增非交互式模式命令行参数与终端检测支持
- [x] S1: 新增非交互式模式命令行参数与终端检测支持
- **描述**: 在 `src/commands/check/types.ts` 和命令行解析入口中引入 `--non-interactive` 标志。并且在 `src/commands/check/validators.ts` 中实现对当前运行终端是否支持 TTY 的检测逻辑。
- **验收条件**: 单元测试和 CLI 能够识别 `--non-interactive`，且可以通过检测 `process.stdout.isTTY` 识别脚本运行环境。
- **依赖**: 无

### S2: 重大决策门禁逻辑改造（支持 CLI 交互）
- [x] S2: 重大决策门禁逻辑改造（支持 CLI 交互）
- **描述**: 在 `src/commands/check/validators.ts` 内改造 `checkMajorDecisionGate` 的调用。若校验失败且处于 TTY 交互模式下（且未声明 `--non-interactive`），自动抛出交互式 select 选择确认：提供常用原因及手打输入，允许用户在 CLI 中完成审批。
- **验收条件**: CLI 运行时触发重大变更后，能够弹出交互框供用户输入审批原因。
- **依赖**: S1

### S3: 实现确认证据自动回写 spec.md 和 spec.json
- [x] S3: 实现确认证据自动回写 spec.md 和 spec.json
- **描述**: 用户在 CLI 确认后，自动回写数据。读取并解析当前任务的 `spec.md` 及 `spec.json` 结构，将“是否涉及重大变更”改为“是，需要用户确认”，同时在“用户确认:”填入刚才输入的确认理由并持久化写入文件，然后继续 check 流程。
- **验收条件**: 回写后重新运行 check 直接通过，且 `spec.md` 与 `spec.json` 内容同步更新且合法。
- **依赖**: S2

### S4: 补充针对交互确认与回写逻辑的单元测试
- [x] S4: 补充针对交互确认与回写逻辑的单元测试
- **描述**: 在 `tests/check-review.test.mjs` 中补充重大变更门禁交互与回写的 Mock 测试，验证 `check` 执行回写后的表现与 `--non-interactive` 阻断。
- **验收条件**: `npm run build:test && npm test` 100% 通过。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [ ] S4

## 依赖关系图
S1 → S2 → S3 → S4
