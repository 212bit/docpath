# T-20260912-review-console-log - review 硬编码绝对路径规则对齐 console.log 测试豁免口径

> backlog_id: R-342
> backlog_source: docpath backlog add

## 1. 背景与动机

src/commands/review.ts:174-176 的硬编码绝对路径规则对所有文件零豁免发 error；其上方 console.log 规则(167行)已对 test/src-commands 豁免且为 warn。review.ts:549 的 approved=groups.errors.length===0 使 error 不论 current_diff/baseline 都阻塞 review，进而卡死 review→check→journal。历史遗留的 /Users/... 测试字面量（baseline 范围）也会误伤。采用 O1：镜像 console.log 豁免口径，测试/命令文件零产出，非测试文件保持 error 严格。

## 2. 需求清单

### 功能需求
- [ ] FR-1: review 硬编码绝对路径规则对齐 console.log 测试豁免口径
  - 来源 backlog: R-342

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- review 硬编码绝对路径规则对齐 console.log 测试豁免口径

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: src/commands/review.ts:174-176 的硬编码绝对路径规则对所有文件零豁免发 error；其上方 console.log 规则(167行)已对 test/src-commands 豁免且为 warn。review.ts:549 的 approved=groups.errors.length===0 使 error 不论 current_diff/baseline 都阻塞 review，进而卡死 review→check→journal。历史遗留的 /Users/... 测试字面量（baseline 范围）也会误伤。采用 O1：镜像 console.log 豁免口径，测试/命令文件零产出，非测试文件保持 error 严格。
- 目标: review 硬编码绝对路径规则对齐 console.log 测试豁免口径
- 背景: 来自 backlog R-342
- 可选方案:
  - O1（采用）: 镜像 console.log 规则豁免口径，加 `&& !file.includes('test') && !file.includes('src/commands/')`，测试/命令文件零产出；非测试文件保持 error 严格。改动 1 行。
  - O2: 测试内降级为 warn（仍产出但不阻塞）。保留可移植信号，但 severity 依赖 file，改动略多。
  - O3: 保持现状，只靠 key 记忆纪律。误伤持续，不选。
- 推荐方案: O1
- 决策理由: 最小、最一致（消除 review.ts 同函数内与 console.log 规则的口径不一致）；生产代码可移植性守卫 intact；测试文件真实机器路径泄漏由 CI 运行期捕获。
- 不做什么: 不改用 warn 降级（O2）、不去除非测试文件的 error 守卫、不扩大范围到其他 review 规则。
- 成本: 极低（1 行 + 可选单测）。
- 风险: 豁免后测试文件 /Users/ 字面量不再被 review 捕获；缓解=与 console.log 同口径已豁免，且 test 运行期失败更直接，鼓励新测试用 join(sep,...) / os.tmpdir()。
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed。
- 用户确认: 已确认（2026-09-12 会话确认 O1，1 行改动）

## 5. 验收标准

- [ ] AC-1: review.ts 硬编码路径规则对 test/src-commands 文件豁免（镜像 console.log 规则 167 行）；非测试文件仍发 error；tests/check-review.test.mjs:628 不受影响仍通过；node bin/docpath.js check 全绿。
- [ ] AC-2: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-3: backlog 条目 R-342 与任务 T-20260912-review-console-log 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
