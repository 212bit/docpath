## 执行计划

### S1: AGENTS.md 唯一真源化与完备性补全
- [x] S1: AGENTS.md 唯一真源化与完备性补全
- **描述**: 将 templates/protocols/AGENTS.md 与根目录 AGENTS.md 确立为全局唯一完备协议真源，补齐 Worktree Concurrent Development（内嵌 worktree-isolation 注入块）等缺失段落。
- **验收条件**: templates/protocols/AGENTS.md 与项目根目录 AGENTS.md 内容完备，包含所有核心规范与 worktree 章节。
- **依赖**: 无

### S2: CLAUDE.md 与 CODEX.md 瘦代理重构
- [x] S2: CLAUDE.md 与 CODEX.md 瘦代理重构
- **描述**: 将 templates/protocols/CLAUDE.md、CODEX.md 及根目录对应文件降级为瘦代理（<30 行），保留各自专属命令与说明，显式指向 @AGENTS.md。
- **验收条件**: CLAUDE.md 与 CODEX.md 行数均严格小于 30 行，且显式声明 @AGENTS.md。
- **依赖**: S1

### S3: 重构 install 与 render 校验逻辑
- [x] S3: 重构 install 与 render 校验逻辑
- **描述**: 调整 src/utils/install-core.ts 与 src/commands/install.ts 中的 entryProtocolFiles，claude 目标补齐 AGENTS.md；更新 templates/protocols/blocks/README.md 覆盖面说明。
- **验收条件**: claude 目标期望资产包含 AGENTS.md，render --view protocols 正常同步且不报错。
- **依赖**: S2

### S4: 测试用例适配与全量门禁验证
- [x] S4: 测试用例适配与全量门禁验证
- **描述**: 更新 tests/render.test.mjs、tests/install.test.mjs 中关于 CLAUDE.md/CODEX.md 的断言，添加瘦代理行数与引用断言，运行全量 docpath check。
- **验收条件**: 全量测试套件、install manifest 校验与 check 门禁全部通过。
- **依赖**: S3

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4

## 依赖关系图
S1 → S2 → S3 → S4
