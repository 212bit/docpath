# T-20260726-review-check-utils - 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理

> backlog_id: R-305
> backlog_source: docpath backlog add

## 1. 背景与动机

二次 review 两项遗留观察：P2-e check 入口段（R-287 heal → R-300 blocks 校验 → quick 升级）执行顺序有语义依赖（heal 必须先于 validators 否则漂移态误判；blocks 漂移应早退于昂贵 runner）但无契约测试；P3 utils/ 55 文件大杂烩——病根是无安置规则，物理搬迁（多深度相对导入 × 全部 dist 测试路径）收益/风险比不划算。

1) check 入口三阶段提为具名函数 + 顺序契约注释；resolveTemplate 增 DOCPATH_TEMPLATES_DIR 环境覆盖（可测试性钩子），CLI 级断言 blocks 漂移早退（输出含不一致错误且不含编译/测试 runner 段落）；heal 先于 validators 由既有陈旧视图用例承担并显式标注契约归属。
2) utils/README.md 域分类法（全部文件归类 + 新代码安置规则）+ 完备性断言测试（utils 新文件未归类即挂）；物理搬迁显式不做并记录理由。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
  - 来源 backlog: R-305

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容

## 3. 范围界定

### 包含
- 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理

### 不包含
- 待在后续规划中补充

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
- [x] 是，需要用户确认

### 变更类型
- [ ] 技术栈 / 框架
- [ ] UI 框架 / 设计系统
- [ ] 构建工具 / 打包方式
- [ ] 数据库 / 存储模型
- [ ] API / 数据契约
- [ ] 部署 / 运行方式
- [ ] 安全 / 权限边界
- [ ] 外部 SDK / 大依赖
- [x] 架构 / 模块边界
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
- 当前问题: 二次 review 两项遗留观察：P2-e check 入口段（R-287 heal → R-300 blocks 校验 → quick 升级）执行顺序有语义依赖（heal 必须先于 validators 否则漂移态误判；blocks 漂移应早退于昂贵 runner）但无契约测试；P3 utils/ 55 文件大杂烩——病根是无安置规则，物理搬迁（多深度相对导入 × 全部 dist 测试路径）收益/风险比不划算。
- 目标: 二次 review 遗留双项: check 入口顺序契约测试 + utils 分类法治理
- 背景: 来自 backlog R-305
- 可选方案:
  - 方案 A: 保持 backlog 范围，进入 spec -> plan -> go 标准流程
  - 方案 B: 补充分析，扩展本任务范围
- 推荐方案: 方案 A
- 决策理由: 方案 A 满足 backlog 声明 of 全部验收条件，且无额外依赖风险
- 不做什么: 不扩大到 backlog 未声明的产品/UI/架构范围
- 成本: 中等，按 plan 拆分后逐步验证
- 风险: 门禁推断可能不完整，执行前仍需 check/review 捕获漂移
- 回滚方案: 回滚本任务提交，或将 backlog 条目退回 proposed
- 用户确认: 2026-07-27 用户显式指令「继续处理 check 入口顺序契约测试和 utils sprawl」; check 入口重构为纯提取零行为变更, env 钩子仅测试用

## 5. 验收标准

- [ ] AC-1: blocks 漂移 fixture 经环境覆盖可测：check 非零退出、含注入区错误、不含编译检查段落（早退证明）。
- [ ] AC-2: 入口三阶段为具名函数且调用顺序与契约注释一致。
- [ ] AC-3: utils 全部文件在 README 分类内，完备性测试防未分类新增；全量套件绿。
- [ ] AC-4: 生成的 spec 可直接进入 `docpath plan`
- [ ] AC-5: backlog 条目 R-305 与任务 T-20260726-review-check-utils 建立双向关联

---

*此文件由 `docpath backlog promote` 生成。*
