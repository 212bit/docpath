## 执行计划

### S1: 实现并验证 review 硬编码绝对路径规则对齐 console.log 测试豁免口径
- [x] S1: 实现并验证 review 硬编码绝对路径规则对齐 console.log 测试豁免口径
- **描述**: 完成 FR-1: review 硬编码绝对路径规则对齐 console.log 测试豁免口径，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: review.ts 硬编码路径规则对 test/src-commands 文件豁免（镜像 console.log 规则 167 行）；非测试文件仍发 error；tests/check-review.test.mjs:628 不受影响仍通过；node bin/docpath.js check 全绿。；AC-2: 生成的 spec 可直接进入 `docpath plan`；AC-3: backlog 条目 R-342 与任务 T-20260912-review-console-log 建立双向关联
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
