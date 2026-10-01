## 执行计划

### S1: 实现并验证 install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）
- [x] S1: 实现并验证 install 正文协议漂移检测门禁（补 R-460 类非 block 漂移）
- **描述**: 完成 FR-1: install 正文协议漂移检测门禁（补 R-460 类非 block 漂移），随做随验（agent_flow 压缩计划，R-334）。
- **验收条件**: AC-1: 新增模板正文漂移检测逻辑，能识别「模板母版新增了正文条款（如 R-460 句式）而仓库协议文件未同步」为漂移；无漂移时不误报。；AC-2: 漂移检测产生机器可读报告，并给出修复动作（如 `docpath install --force` 或 `docpath update --reset-protocols`）。；AC-3: 有回归测试钉住：故意让仓库 AGENTS.md 缺模板新增的某正文句 → 检测命中标为 drift；仓库协议含非 {{PROJECT_NAME}} 的有意定制 → 不误报或按配置豁免。；AC-4: 生成的 spec 可直接进入 `docpath plan`；AC-5: backlog 条目 R-462 与任务 T-20261001-install-r-460-block 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
