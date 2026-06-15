## 执行计划

### S1: 梳理 JSON 单真源边界与兼容策略
- **描述**: 梳理 workspace evidence、task spec/plan、runtime status/next、render 输出和漂移检测的受影响模块，确认 JSON-first、Markdown 回退与兼容视图边界。
- **验收条件**: 明确 last-check/review/pending-done JSON schema、JSON-only 读取入口、Markdown 兼容输出和不迁移人类维护 Markdown 的边界。
- **依赖**: 无

### S2: 补齐 workspace evidence JSON 真源
- **描述**: 为 check/review/pending-done 增加 JSON 真源读写与 Markdown 兼容视图生成，写入路径使用原子写入，旧 Markdown 缺 JSON 时可回退读取。
- **验收条件**: check 写 last-check.json，review 写 review.json，agent step/done 维护 pending-done.json；既有 Markdown 视图仍生成。
- **依赖**: S1

### S3: 切换核心读取路径为 JSON-first
- **描述**: 将 status/next/agent/check/review 等核心内部读取收敛到 state.json、JSON evidence 或 JSONL，缺少 Markdown 视图时仍可运作。
- **验收条件**: 关键 CLI 在移除 current.md/last-check.md/review.md/pending-done.md 兼容视图后仍能基于 JSON/JSONL 输出正确状态或路由。
- **依赖**: S2

### S4: 增加 render 视图入口
- **描述**: 提供 render 命令或等价入口，从 JSON/JSONL 真源输出 current、spec、plan、breadcrumb、check、review 的 Markdown 视图。
- **验收条件**: render --view plan/current/spec/breadcrumb/check/review 可输出对应 Markdown；render --all 可生成所有支持视图。
- **依赖**: S3

### S5: 收窄漂移补偿并补齐回归测试
- **描述**: 删除或收窄仅服务 MD↔JSON 双写漂移的默认检测/sync/fix-drift 路径，补齐 JSON-only、Markdown 回退、render、原子写入和完整回归测试。
- **验收条件**: 相关测试覆盖新增路径；pnpm build、pnpm test、docpath check、docpath review 通过。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
