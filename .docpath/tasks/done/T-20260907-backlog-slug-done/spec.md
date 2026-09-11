# T-20260907-backlog-slug-done - backlog 文件名卫生: 新条目加标题 slug + 撞号非破坏性检测

> backlog_id: R-321
> backlog_source: docpath backlog add

## 1. 背景与动机

ls .docpath/backlog/ 全是裸号 R-###.md(active 20/20),不打开无法辨识内容;task 目录却带 slug,两者不一致。R-321 本条创建后仍为 R-321.md,当场复现。

已验证根因:
- 裸号: createBacklogItem 用 wx 原子占号时写死裸名 R-###.md,使 writeBacklogItem 的 id-slug 命名分支永远命中 existing 而成死代码。

实现期新发现(证伪原 D2 前提):
- 最初以为"5 个 done 未归档"是 refreshBacklogIndex 归档不幂等。取证后发现 R-260/261/262/263/268 在 active 与 archived 各存一条,是**同 id 下的两条不同需求**(不同 title/task/created_at),即 **id 撞号**,非陈旧副本。根因为 R-273(nextBacklogId 扫主 checkout)之前 worktree 号池 stale 的历史残留。
- 因此 refreshBacklogIndex "遇 archived 同名则跳过"其实是**安全阀**(阻止一条需求覆盖另一条不同需求)。原计划"清除 active 副本 / 覆盖归档"会**销毁数据**,已废弃。改为**非破坏性检测**:把静默跳过显式暴露,数据迁移另立独立条目 R-322。

## 2. 需求清单

### 功能需求
- [ ] FR-1: 新建 backlog 条目文件名带标题 slug,格式 R-###-<slug>.md,ls 即可辨识
  - slug 策略(D1=Unicode 保留): 保留中文,仅清洗文件系统非法字符,空白转连字符并折叠,ascii 小写,按码点截断 32 字,首尾去连字符,空则回退 item
  - createBacklogItem 三步保 id 唯一: wx 占裸名(per-id 原子锁) -> 复检同 id slug 兄弟文件(命中则释放重试) -> rename 成 slug 名
  - 来源 backlog: R-321
- [ ] FR-2: id 撞号非破坏性检测(D2 重定向): 新增 detectBacklogIdCollisions,backlog groom 以**非阻塞告警**暴露 active/archived 同 id 并存(不计入 issue/不影响 passed);refreshBacklogIndex 保留安全阀跳过,绝不自动改数据
- [ ] FR-3: 向后兼容: 存量裸号仍按 id 前缀被 findItemFile/readBacklogItem/nextBacklogId 正确解析,不批量迁移存量文件
- [ ] FR-4: 并发扫描容错: 裸名->slug 名的瞬时 rename 窗口内,listBacklogItems 对消失文件(ENOENT)跳过而非崩溃

### 非功能需求
- [ ] NFR-1: 保持与现有 DocPath 工作流兼容,不改 backlog FSM 与 id 键模型

## 3. 范围界定

### 包含
- src/engine/backlog.ts: slugify 改 CJK 容错; createBacklogItem 占号-recheck-rename; refreshBacklogIndex 安全阀注释; detectBacklogIdCollisions; readFileOrSkip 并发容错
- src/commands/backlog.ts: groom 渲染 + --agent 输出加非阻塞 id_collisions 告警
- 测试: CJK slug 生成/截断/非法字符、撞号检测、裸号兼容、groom 非阻塞告警、并发扫描容错

### 不包含
- 批量重命名存量 116 个裸号文件
- 5 起历史 id 撞号的数据迁移(id 重分配 + links 修正)—— 已拆分为独立条目 R-322,需自己的 Decision Brief
- analysis 目录 R-###-section.md 命名
- backlog FSM / workflow state / 任何模块分组层级
- backlog list 视图语义

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | D1 slug 策略 | Unicode保留/纯ASCII/拼音转写 | Unicode 保留 | 中文仓最自描述; 纯ASCII丢中文语义, 拼音需重依赖 |
| 2 | D2 done 重复 | 清除active副本/非破坏性检测 | 非破坏性检测 | 取证证伪: 5 条是 id 撞号非陈旧副本, 清除会销毁数据 |
| 3 | 撞号数据迁移 | 本任务内做/拆独立条目 | 拆独立条目 R-322 | 改 id 牵动 links 与历史引用, 非 trivial, 需独立 Decision Brief |
| 4 | 存量迁移 | 批量重命名/只向前 | 只向前 | 存量 98% 终态, 迁移破坏引用与 git 连续性, 收益近 0 |

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
- 当前问题: backlog 条目文件名为裸号, ls 无法辨识; 5 个 id 在 active/archived 撞号(R-273 前残留)。
- 目标: 新条目 ls 即可辨识; 撞号非破坏性可见; 存量零迁移向后兼容; 不销毁任何数据。
- 背景: 来自 backlog R-321。取证发现原 D2 前提("done 未归档=归档不幂等")被证伪——实为 id 撞号, 两条不同需求共享一个 id; refreshBacklogIndex 的跳过是安全阀而非缺陷。
- 可选方案:
  - D1: A=Unicode保留 / B=纯ASCII / C=拼音转写
  - D2(重定向前): A=清除active副本 / B=列表默认过滤  —— 均被证伪(会销毁数据或未治本)
  - D2(重定向后): 非破坏性撞号检测 + 数据迁移拆独立条目
- 推荐方案: D1=A Unicode保留; D2=非破坏性检测(groom 告警), 迁移拆 R-322。
- 决策理由: D1-A 对中文仓自描述, findItemFile 走 id 前缀对 unicode 规范化不敏感; D2 清除/覆盖会销毁撞号中的一条合法需求, 故只检测不改数据, 迁移交独立条目审慎处理。
- 不做什么: 不清除/覆盖任何撞号文件; 不批量迁移存量; 不引入模块分组层级; 不动 FSM。
- 成本: 小, level-1 单模块 + 测试。
- 风险: unicode 文件名在 macOS/Linux/git 无碍, Windows 非法字符已清洗; 瞬时 rename 窗口的并发扫描已由 FR-4 容错覆盖。
- 回滚方案: 回滚本任务单提交; 新命名只影响新条目, 存量裸号照旧可读; 撞号检测为纯读, 无副作用。
- 用户确认: 已确认(会话内 AskUserQuestion, 2026-09-07: D1=Unicode保留; D2 重定向=非破坏性撞号检测, 迁移另立条目)。

## 5. 验收标准

- [ ] AC-1: 新建 backlog 条目文件名为 R-###-<slug>.md, 中文标题语义保留(活体已验: R-322-解决-5-起历史-backlog-id-撞号...), ls 可辨识
- [ ] AC-2: backlog groom 非破坏性检出 active/archived 同 id 撞号并告警(活体已验: 真实仓库报出 5 起), 不计入 issue_count / 不改变 passed, 两侧文件均保留
- [ ] AC-3: 存量裸号 R-###.md 仍可被 read/find/nextId 正确解析, promote/edit/list 不受影响
- [ ] AC-4: 新增测试覆盖 slug 生成(中文/纯中文/非法字符/超长截断)、撞号检测、裸号兼容、groom 非阻塞告警、并发扫描 ENOENT 容错; 全量套件绿
- [ ] AC-5: 5 起历史撞号的数据迁移已拆为独立条目 R-322; backlog R-321 与任务 T-20260907-backlog-slug-done 双向关联

---

*此文件由 docpath backlog promote 生成 seed; Decision Brief 经用户确认, 并记录实现期对 D2 前提的证伪与重定向。*
