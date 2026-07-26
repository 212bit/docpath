## 执行计划

### S1: 实现并验证 install --check 不读安装元数据 target 默认 universal, 非 universal 项目产生跨 target 假漂移 (SynapBuddy 实测)
- [x] S1: 实现并验证 install --check 不读安装元数据 target 默认 universal, 非 universal 项目产生跨 target 假漂移 (SynapBuddy 实测)
- **描述**: 完成 FR-1: install --check 不读安装元数据 target 默认 universal, 非 universal 项目产生跨 target 假漂移 (SynapBuddy 实测)，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: codex 项目无 --target 的 check 用 codex 期望集且通过（假漂移消除）。；AC-2: 非 force 安装有跳过项时终局输出含警示清单、无 🎉；全量套件绿。；AC-3: 生成的 spec 可直接进入 `docpath plan`；AC-4: backlog 条目 R-311 与任务 T-20260726-install-check-target-universal-universal 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
