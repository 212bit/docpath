## 执行计划

### S1: 梳理 inferNextAction completed/idle 路由顺序
- [x] S1: 梳理 inferNextAction completed/idle 路由顺序
- **描述**: 阅读 `src/utils/agent-output/formatters.ts` 中 completed 与 idle 分支，确认 dirty closeout、accepted executable、immature accepted、proposed、learn、gc/capture 的现序；设计 learn 上移后的顺序与 installHealth 入参方式。
- **验收条件**: 明确改动点与新优先级表（P0 dirty → P1 accepted executable → P2/P3 learn → P4 immature/proposed → P5 gc/capture）；不改变 executing 等活跃阶段分支。
- **依赖**: 无

### S2: 实现 learn 优先于 proposed/immature backlog
- [x] S2: 实现 learn 优先于 proposed/immature backlog
- **描述**: 调整 `inferNextAction` completed 与 idle 分支：当存在 actionable pending lessons 时，在 immature accepted / proposed shaping 之前返回 `docpath learn --dry-run`；保持 dirty closeout 与 accepted executable promote 优先。
- **验收条件**: FR-1、FR-2、FR-3；completed/idle 行为与 AC-1/AC-3 一致。
- **依赖**: S1

### S3: 接入 health/regression 告警文案
- [x] S3: 接入 health/regression 告警文案
- **描述**: 将 `context.installHealth`（passed===false 或 errors/warnings>0）传入路由推断；在 learn 路由的 next_action 中体现待固化 lesson，告警存在时文案更明确；不强制改变 P1/P0 顺序。
- **验收条件**: FR-4、AC-2；无 installHealth 时 learn 仍可压过 proposed。
- **依赖**: S2

### S4: 补充 next 回归测试
- [x] S4: 补充 next 回归测试
- **描述**: 在 `tests/next.test.mjs` 增加：completed+lessons+proposed raw → learn；+install fail → learn；+accepted executable → promote；low-value only + proposed → 不强制 learn；dirty worktree → changes。必要时构建 dist 后跑测试。
- **验收条件**: AC-4、AC-5；现有 learn-before-capture 用例仍通过。
- **依赖**: S3

### S5: 验证与收口
- [x] S5: 验证与收口
- **描述**: 运行相关测试与 `docpath check`/`review`/`journal` 收口；确认 major change 已确认、R-237 关联有效。
- **验收条件**: AC-6；check/review 通过或明确记录阻塞；工作流可完成。
- **依赖**: S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S2 → S3 → S4 → S5
