# R-355 技术分析：改造点定位（文件级，不预设实现细节）

## 改造点地图
| FR | 文件 | 现状锚点 |
|----|------|---------|
| FR-1 | src/engine/backlog.ts | writeBacklogItem 尾部隐式 refreshBacklogIndex；refreshBacklogIndex 内嵌归档副作用 |
| FR-2 | src/engine/backlog.ts | nextBacklogId：4 目录 readdir 取 max + `wx` 裸锁（createBacklogItem 局部） |
| FR-3 | src/engine/backlog.ts | archiveBacklogItem/归档 rename 的 existsSync 检查（TOCTOU 窗口） |
| FR-4 | src/commands/backlog.ts + register/backlog-maintenance.ts | 动作名单 3 处硬编码；单文件 ~1300 行 |
| FR-5 | src/commands/backlog.ts | missingReadinessEvidence / assertBacklogReadyForExecution（backlog.ts:286） |
| FR-6 | src/commands/backlog.ts | backlogCapture/backlogAdd；detectBacklogDuplicates 已存在（engine，R-352） |

## 关键约束（实现时必须遵守）
1. 撞号安全阀语义保留（R-321/FR-2 非破坏性）：归档冲突不得覆盖，但按 FR-3 要「即时报错留痕」——二者收敛方式由实现决策记录定义（报错 vs 记录后继续，涉及行为变更需回写本分析）。
2. nextBacklogId 的主 checkout 扫描（R-273/FR-3）语义不能弱化：任何 O(1) 方案必须保留跨 checkout 可见性。
3. 现有 856 测试是行为护栏；FR-1 若改变归档触发时机，须确认「drop 即归档」验收（R-352 落地语义）不回退。
4. �作清单单真源后，`backlog --help` 文案与报错文案是派生物，不许再手写。

## 步骤建议（plan 阶段定稿）
S(小): FR-5 evidence 校验（门禁收紧，独立可验）
S(小): FR-4 动作单真源
S(中): FR-6 capture 去重（复用 detectBacklogDuplicates 扩展到 add/capture + 主 checkout 扫描）
S(大): FR-1 写路径解耦 + FR-3 归档原子化（同批改写路径，一起回归）
S(大): FR-2 id 分配原子化（单独决策记录：锁文件 vs 权威计数器 vs 保持扫描加锁）
