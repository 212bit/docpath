## 执行计划

### S1: 梳理流程路由与证据写入点
- **描述**: 定位 pending-done 路由、plan 完成度检查、structured-docs 读写、review/check decisions 写入和 changes 输出相关代码与测试入口。
- **验收条件**: 明确每个修复点的代码落点和回归测试位置。
- **依赖**: 无

### S2: 修复 pending-done 路由与 terminal verification 策略
- **描述**: 调整 next/status 或路由逻辑，使 pending-done 不再覆盖未完成或进行中的 plan step；同时修复 check 与 terminal verification step 的自指死结。
- **验收条件**: 未完成步骤存在时 next 推荐继续 step；terminal verification step 不需要先假完成才能运行 check。
- **依赖**: S1

### S3: 增加 spec/plan JSON 与 Markdown hash drift 检查
- **描述**: 为 structured spec/plan JSON 写入 Markdown hash，并在 active task 读路径或 check 中发现失步时 fail loud，保留旧 Markdown fallback 与损坏 JSON fail loud。
- **验收条件**: JSON/Markdown 失步会失败并提示 tasks sync 修复命令；旧任务缺 JSON 仍兼容。
- **依赖**: S1

### S4: 收紧 decisions.md 写入边界
- **描述**: 修复 review/check 普通统计写入 decisions.md 的路径，只保留 review.md、last-check、breadcrumb 等证据输出。
- **验收条件**: review/check 不再新增低价值 ADR，测试覆盖 decisions.md 不变。
- **依赖**: S1

### S5: 暴露 ignored evidence 提交提示并补齐回归测试
- **描述**: 在 changes 或 agent 输出中提示被 git ignore 的 backlog/task evidence，补齐上述修复点的回归测试。
- **验收条件**: 输出包含需要 git add -f 的 ignored evidence 列表；相关单测覆盖并通过。
- **依赖**: S2, S3, S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2
S1 → S3
S1 → S4
S2/S3/S4 → S5
