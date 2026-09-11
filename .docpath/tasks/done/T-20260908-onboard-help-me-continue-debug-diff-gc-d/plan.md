## 执行计划

### S1: 梳理 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
- [x] S1: 梳理 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
- **描述**: 根据 spec 明确 FR-1: 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中) 的实现边界和验收口径。
- **验收条件**: AC-1: [ ] `onboard` `help-me` `continue` `debug` `diff` 五个命令及其实现文件全链删除；执行时返回非零退出与明确提示
- **依赖**: 无

### S2: 实现 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
- [x] S2: 实现 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中)
- **描述**: 在现有架构内完成 FR-1: 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中) 的代码与文档更新。
- **验收条件**: FR-1 零使用命令删除: onboard / help-me / continue / debug / diff / gc-decisions (trace 1460 次零命中) 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: [ ] `onboard` `help-me` `continue` `debug` `diff` 五个命令及其实现文件全链删除；执行时返回非零退出与明确提示；AC-2: [ ] `gc-decisions` 先核实与 R-302 trace 轮转的关系：若已被取代则一并删除，若仍承担独立职责则保留并在本条目记录结论；AC-3: [ ] 命令元数据条目数与文档清单同步下降，六维无残留引用；AC-4: [ ] 对已删命令补 fail-loud 断言（调用即非零退出），防复辟；AC-5: [ ] 全量测试与 typecheck 通过，零行为回归；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-315 与任务 T-20260908-onboard-help-me-continue-debug-diff-gc-d 建立双向关联
- **验收条件**: AC-1: [ ] `onboard` `help-me` `continue` `debug` `diff` 五个命令及其实现文件全链删除；执行时返回非零退出与明确提示；AC-2: [ ] `gc-decisions` 先核实与 R-302 trace 轮转的关系：若已被取代则一并删除，若仍承担独立职责则保留并在本条目记录结论；AC-3: [ ] 命令元数据条目数与文档清单同步下降，六维无残留引用；AC-4: [ ] 对已删命令补 fail-loud 断言（调用即非零退出），防复辟；AC-5: [ ] 全量测试与 typecheck 通过，零行为回归；AC-6: 生成的 spec 可直接进入 `docpath plan`；AC-7: backlog 条目 R-315 与任务 T-20260908-onboard-help-me-continue-debug-diff-gc-d 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
