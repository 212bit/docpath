## 执行计划

### S1: workflow-profile.ts 加 instant profile
- **描述**: WorkflowProfile 类型加 `'instant'`;PROFILE_POLICIES.instant = { requiresSpec:false, requiresPlan:false, requiresCheck:false, requiresReview:false, journalMode:'minimal' };normalizeWorkflowProfile 接受 'instant';加 isInstantProfile 辅助。
- **验收条件**: typecheck 通过;normalizeWorkflowProfile('instant') 返回 'instant';gatePolicyForProfile('instant').requiresCheck === false。
- **依赖**: 无

### S2: check.ts 加 lite 模式(仅 typecheck + 结构门禁)
- **描述**: checkCommand 加 `lite?: boolean` 选项;lite=true 时跳过 build+test+lint(heavy),保留 typecheck(detectCompileChecks)+ plan-sync + task-file-drift + major-change-gate + context-health。
- **验收条件**: lite 模式跑 typecheck 不跑 build/test;非 lite 行为不变;typecheck 失败时 lite 仍 fail。
- **依赖**: 无

### S3: agent.ts runAgentCheckGate 对 instant 走 lite
- **描述**: runAgentCheckGate 检测 instant profile 时调 checkCommand({ lite:true })而非全量;runAgentReviewGate 对 instant 同 quick 跳 review。done.ts 门禁序列输出区分 instant。
- **验收条件**: instant 任务 done 时跑 lite check(无 build/test)+ 跳 review;standard/quick 行为不变。
- **依赖**: S1, S2

### S4: quick.ts 加 --instant 入口 + quick-guard 守卫
- **描述**: quick 命令加 `--instant` flag,设置 workflow_profile:'instant' + level:0;quick-guard 范围守卫(≤3 文件、风险路径拒绝)对 instant 同样适用。
- **验收条件**: `docpath quick --instant "x"` 创建 instant 任务;超范围/风险路径被拒;状态 profile=instant。
- **依赖**: S1

### S5: 测试 + 全量校验
- **描述**: 新增 instant profile 测试:创建 instant 任务、done 跑 lite check(无 build/test)、跳 review、quick-guard 守卫。跑 pnpm test + docpath check + review。
- **验收条件**: 新测试覆盖 instant 路径;全量测试绿;docpath check/review 通过。
- **依赖**: S1-S4

## Checklist
- [x] S1
- [x] S2
- [x] S3
- [x] S4
- [x] S5

## 依赖关系图
S1 → S3 → S5
S2 → S3
S1 → S4 → S5
