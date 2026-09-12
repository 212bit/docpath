## 执行计划

### S1: 实现并验证 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
- [x] S1: 实现并验证 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异
- **描述**: 完成 FR-1: 全局安装与仓库开发版漂移提示：PATH 旧版无感知，双轨易踩行为差异，随做随验（agent_flow 压缩计划，R-334）。
- **验收条件**: AC-1: 1) install-core 新增 checkGlobalVersionDrift（warn 级）：docpath 源码 checkout 内 PATH docpath 版本与仓库 package.json 版本不一致时产出 global-version-drift issue，install --doctor 可见；2) next --agent 首次检测到新漂移状态给一行 advisory 提示（nag-once，同版本对不重复），指明 node bin/docpath.js 正确调用；3) getting-started 补双轨说明；4) 非 docpath 项目/无全局安装/版本一致三种场景零噪音；5) 回归测试锁定；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-332 与任务 T-20260912-path 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
