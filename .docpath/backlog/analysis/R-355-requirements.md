# R-355 需求分析：高优先级架构优化包

## 1. 来源与取证
架构评审（2026-09-23 会话，基于真实代码逐点取证，非推测）。6 个高优先级点的证据：
1. 写放大：`writeBacklogItem` 每写必调 `refreshBacklogIndex`（全目录 readdir×2 + 归档 rename + 重建）。
2. id 分配：`nextBacklogId` 扫 backlog/ + archived/ + 主 checkout 两份 = 4 次全目录扫描；代码注释自认跨 checkout 原子性缺口；历史 5 起撞号（R-321/322）。
3. 动作名单：register 描述 / 无 action 报错 / default 报错 ≥3 处硬编码（本次加 archive 实测逐一同步）；`src/commands/backlog.ts` ~1300 行混杂校验/编排/渲染/输出。
4. evidence 门禁：promote 只查字段非空（backlog.ts:286 `!item.evidence.analysis && !item.evidence.spec`），edit 挂路径无存在性校验。
5. 归档竞态：`existsSync(target) + rename` 非原子；撞号静默跳过靠事后 `groom` 暴露；同族 rename TOCTOU 已有 R-296 记录。
6. 重复登记：3 例实测（R-058/059、R-061、R-064，使用方项目）+ 本仓库 R-352 自身；capture/add 入口零去重，去重只在 promote 提示（R-352 刚落地）。

## 2. FR 清单（对应评审目标状态）
- FR-1 写路径解耦：单条写入成本与目录总量无关；索引重建与归档不再隐式挂在每次写上（显式或惰性）。
- FR-2 id 分配原子化：单一权威源上的原子分配，跨 checkout/并发无撞号窗口，O(1)。
- FR-3 归档原子化：existsSync+rename TOCTOU 消除；冲突发生时即时报错留痕，不依赖事后扫描。
- FR-4 动作清单单真源：帮助/校验/报错派生自单一动作表；命令层按校验/编排/渲染/输出职责拆分（本次至少完成动作单真源 + 文件拆分的边界划定，全量拆分随步骤推进）。
- FR-5 evidence 存在校验：引用必须解析到真实文件，否则门禁拒绝，readiness 信号可信。
- FR-6 capture 期去重：capture/add 时扫描本 checkout + 主 checkout 的 active/archived（复用 detectBacklogDuplicates），重复在产生时提示。

## 3. 验收
见 backlog add --acceptance（6 条 + 全量测试 + check 过门禁）。

## 4. 非目标
- worktree 快照过期根治 → R-356（另行 brainstorm，涉及共享模型，可能推翻 R-238/R-273 分层）。
- 同义不同名语义级判重（机械门禁做不到，会误并）。
- 索引/归档的持久化引擎替换（如引入 sqlite）——FR-2 若确需，随实现决策记录再议。

## 5. 风险与兼容
- FR-1/FR-3 改写路径是引擎核心，回归风险最高，必须保持外部行为兼容（现有 856 测试是护栏）。
- FR-2 触碰 id 分配 = worktree 并发契约（R-273/FR-3），改动须与 nextBacklogId 的主 checkout 扫描语义等价或更严。
- FR-5 会让「挂假引用」的历史操作暴露——属预期收紧，groom 同步提示。
