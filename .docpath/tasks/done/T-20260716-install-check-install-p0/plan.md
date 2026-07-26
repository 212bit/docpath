## 执行计划

### S1: 梳理 install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作
- [x] S1: 梳理 install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作
- **描述**: 根据 spec 明确 FR-1: install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作 的实现边界和验收口径。
- **验收条件**: AC-1: AC-1: 构造三种方向的临时工作区, install --check 输出各自方向标签与对应建议; local_ahead 场景输出含"回灌模板"警示且不推荐直接覆盖。
- **依赖**: 无

### S2: 实现 install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作
- [x] S2: 实现 install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作
- **描述**: 在现有架构内完成 FR-1: install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作 的代码与文档更新。
- **验收条件**: FR-1 install --check 漂移不分方向: 本地领先时仍推荐覆盖式 install, 曾指向致 P0 的操作 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: AC-1: 构造三种方向的临时工作区, install --check 输出各自方向标签与对应建议; local_ahead 场景输出含"回灌模板"警示且不推荐直接覆盖。；AC-2: AC-2: install_health 在 local_ahead 场景的 recommended_command 不是覆盖式 install。；AC-3: AC-3: 既有 31 条 install 用例回归; pnpm test 全绿。；AC-4: AC-4: R-277 修复后的当前仓库 install --check 仍通过 (无回归)。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-279 与任务 T-20260716-install-check-install-p0 建立双向关联
- **验收条件**: AC-1: AC-1: 构造三种方向的临时工作区, install --check 输出各自方向标签与对应建议; local_ahead 场景输出含"回灌模板"警示且不推荐直接覆盖。；AC-2: AC-2: install_health 在 local_ahead 场景的 recommended_command 不是覆盖式 install。；AC-3: AC-3: 既有 31 条 install 用例回归; pnpm test 全绿。；AC-4: AC-4: R-277 修复后的当前仓库 install --check 仍通过 (无回归)。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-279 与任务 T-20260716-install-check-install-p0 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
