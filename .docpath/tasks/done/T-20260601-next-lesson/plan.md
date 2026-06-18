## 执行计划

### S1: 定位 next 路由与 lesson 候选格式
- [x] S1: 定位 next 路由与 lesson 候选格式
- **描述**: 梳理 agent-output 的 backlog/idle/completed 路由，以及 lesson-candidates.md 的候选条目结构。
- **验收条件**: 明确 learn 引导的触发条件、优先级和 required_files 输出。
- **依赖**: 无

### S2: 实现 next lesson 引导
- [x] S2: 实现 next lesson 引导
- **描述**: 增加 lesson 候选检测逻辑，并在 idle/completed 且无更高优先级待执行任务时推荐 docpath learn。
- **验收条件**: 有效候选触发 learn，空模板不触发，accepted backlog 仍优先 promote。
- **依赖**: S1

### S3: 补充回归测试并完成门禁
- [x] S3: 补充回归测试并完成门禁
- **描述**: 扩展 next 路由测试，覆盖 completed、idle、accepted backlog 和空候选文件场景，运行测试、check、review 和 journal。
- **验收条件**: 新增测试和全量测试通过，docpath check 与 docpath review 通过。
- **依赖**: S2

## 依赖关系图
S1 → S2 → S3
