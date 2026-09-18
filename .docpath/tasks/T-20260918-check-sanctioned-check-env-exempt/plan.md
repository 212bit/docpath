## 执行计划

### S1: 实现并验证 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道
- [x] S1: 实现并验证 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道
- [x] S1: 实现并验证 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道
- **描述**: 完成 FR-1: 环境性 check 失败缺少 sanctioned 出口：新增 check_env_exempt 环境豁免通道，随做随验（agent_flow 压缩计划，R-334）。
- **验收条件**: AC-1: 仅探针类/工具链类失败时（如 pnpm shim 不可用、`docker: command not found`），；AC-2: `docpath check` 落 `check_env_exempt`，打印豁免原因并留痕；随后 `agent done` /；AC-3: `docpath done` 能正常收口。；AC-4: 混合失败（环境类 + 结构门禁/harness/真实编译测试失败）仍落 `check_fail`，；AC-5: 收口被拒（契约不回退）。；AC-6: 歧义模式（`Cannot find module` / `MODULE_NOT_FOUND` / `ENOENT.*node_modules`）；AC-7: 不触发豁免，仍落 `check_fail`。；AC-8: `docpath check --no-env-exempt` 下即使全是环境失败也落 `check_fail`；；AC-9: 豁免态非粘性（随后一次真实失败覆盖为 check_fail）。；AC-10: 单测覆盖上述四态，含 `check.env_exempt` 的转换合法性与；AC-11: `requiredGate`/`allowedCompletionGates` 允许集合。；AC-12: 生成的 spec 可直接进入 `docpath plan`；AC-13: backlog 条目 R-350 与任务 T-20260918-check-sanctioned-check-env-exempt 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
