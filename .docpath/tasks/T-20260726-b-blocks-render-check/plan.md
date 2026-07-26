## 执行计划

### S1: 梳理 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
- [x] S1: 梳理 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
- **描述**: 根据 spec 明确 FR-1: 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验 的实现边界和验收口径。
- **验收条件**: AC-1: 两块源落地，注入区渲染幂等（连续 render 零 diff）；未知块名 fail-loud。
- **依赖**: 无

### S2: 实现 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
- [x] S2: 实现 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验
- **描述**: 在现有架构内完成 FR-1: 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验 的代码与文档更新。
- **验收条件**: FR-1 协议共享契约段注入 (方案 B): blocks 源 + 标记注入 + render 渲染 + check 校验 已实现，并保持现有工作流兼容。
- **依赖**: S1

### S3: 验证验收标准
- [x] S3: 验证验收标准
- **描述**: 验证 spec 中声明的验收标准：AC-1: 两块源落地，注入区渲染幂等（连续 render 零 diff）；未知块名 fail-loud。；AC-2: 覆盖面达成（lifecycle 3/4 + worktree 3/4，每 flavor ≥1 块），worktree 三份分叉收敛到块源全文。；AC-3: check 在注入区漂移时 fail-loud 并给出 render 命令；块源修改经 render 一次收敛全部注入点。；AC-4: 全量套件绿；root 副本经 install 机制同步后 manifest 全绿。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-300 与任务 T-20260726-b-blocks-render-check 建立双向关联
- **验收条件**: AC-1: 两块源落地，注入区渲染幂等（连续 render 零 diff）；未知块名 fail-loud。；AC-2: 覆盖面达成（lifecycle 3/4 + worktree 3/4，每 flavor ≥1 块），worktree 三份分叉收敛到块源全文。；AC-3: check 在注入区漂移时 fail-loud 并给出 render 命令；块源修改经 render 一次收敛全部注入点。；AC-4: 全量套件绿；root 副本经 install 机制同步后 manifest 全绿。；AC-5: 生成的 spec 可直接进入 `docpath plan`；AC-6: backlog 条目 R-300 与任务 T-20260726-b-blocks-render-check 建立双向关联
- **依赖**: S2

## Checklist
- [x] S1
- [x] S2
- [x] S3

## 依赖关系图
S1 → S2 → S3
