---
related:
  - product-panorama.md
  - architecture/breadcrumb-task-level-architecture.md
  - features/worktree-workflow.md
  - design/refactor-doc-management-plan.md
---

# DocPath — 进度与方向

> 本文是**进度与方向**的权威载体（项目此前无 roadmap 载体，本文为新建）。
> 所有结论均可回溯到 §5 的证据引用表；未标注出处的判断一律视为待验证假设。
> 生成日期：2026-10-02（对应 HEAD `604a68a`）。

---

## 1. 现状快照

### 1.1 规模（实测）

| 指标 | 数值 | 出处 |
|------|------|------|
| 提交总数 | 840 | `git rev-list --count HEAD` |
| 开发时间跨度 | 2026-05-28 → 2026-10-02（约 4 个月） | `git log --format='%ad' --date=short` |
| 源码规模 | 204 个 `.ts` / 62,384 行 | `find src -name '*.ts'` |
| 测试规模 | 130 个 `.test.mjs` / 35,970 行 | `ls tests/*.test.mjs` |
| 测试通过数 | 1195 / 1195 | `node --test tests/*.test.mjs` |
| CLI 命令面 | 54 个命令模块 | `ls src/commands/*.ts` |
| 活文档 | 28 篇（Active 28 / WIP 0 / Deprecated 0） | `docpath docs doctor` |
| 文档体检 | 🟢 HEALTHY，10 项全绿 | `docpath docs doctor` |

**测试/源码比 ≈ 0.58**（35,970 / 62,384），测试密度在 CLI 工具类项目中偏高，是该项目最扎实的资产之一。

### 1.2 已完成（已封板）

DocPath 的核心工作流骨架已成型并经过实战：

- **状态机与生命周期**：Backlog → Spec → Plan → Step → Check/Review/Journal → Commit 全链路（`docs/product-panorama.md` §2 三层模型）。
- **门禁体系**：`check`（编译/测试/lint + 环境豁免分类）、`review`（结构化审查）、`verify`（语义反漂移）、`arch check`（分层防腐）。
- **并发开发**：`worktree` 全套（create/doctor/repair/merge/sync/matrix/broadcast/prune），隔离契约文档化于 `docs/features/worktree-workflow.md`。
- **多 Agent 适配**：CLAUDE / CODEX / OPENCODE / AGENTS 四入口，thin-proxy 收敛为 AGENTS.md 单一完备真源（R-341）。
- **文档治理**：`docpath docs` 生命周期巡检（死链/漂移/索引同步），实测 10 项全绿。
- **可观测性**：`stats` / `monitor` / `budget` / `trace` 四套度量，含真实 Token 归因与流程合规审计。

**Backlog 完成率 93%**（255 条中 238 done，16 dropped）。

### 1.3 进行中

- **活跃需求仅 1 条**：`R-449`（write-spec 覆盖写告警 + 非规范 Decision Brief 位置检测，P2/shaped）。
- **工作树干净**：`git status --porcelain` 为 0 项，无未收口变更。
- 最近一周（09-29 → 10-02）的提交主线是**协议瘦身 + 漂移自愈 + Token 度量**，属收敛型工作而非功能扩张。

### 1.4 已知缺陷（仓库自陈，非外部推断）

按严重度排列，均可在源码/规则中定位：

1. **`architecture.md` 规则正文过期（本次实测发现）**：`.docpath/rules/architecture.md:52` 仍写"`src/utils/changes-report.ts:152` 遗留重复实现 (R-289 待修)"，但 R-289 实际已 `status: done`——`changes-report.ts:12` 已改为 `import { isLinkedGitWorktree } from './git-dirty-guard.js'`，全仓仅一份实现。**规则真源滞后于代码**，会误导后续 Agent 去"修"一个不存在的问题。
2. **`config.yaml` 与 `config.json` 是真源分裂**（`.docpath/rules/architecture.md` gotcha 条目）——`init` 只写 yaml；`src/utils/config.ts:15` 已声明 yaml 优先、json 回退的优先级，但两条读取路径并存仍有"写了读不到"的风险面。
3. **上下文预算 critical**：`docpath budget --agent` 报 `status: critical`，总 206,916 tokens；其中 `views` 占 66%（136,664）、`events` 14%、`governance` 13%。
4. **R-449 描述的两个静默隐患**：write-spec 全量覆盖无告警；Decision Brief 落错章节会丢机器真源。
5. **环境依赖缺陷（本次实测发现，未记录在案）**：沙箱/只读 `$HOME` 下 `~/.docpath/projects.sqlite` 不可写，`docpath init` 失败并报 `attempt to write a readonly database`，连带 6 个测试失败（详 §2）。

---

## 2. 关键判断

**DocPath 当前卡的不是"功能不够"，而是"从工程完备到可交付可信"的收敛层。**

三条支撑证据：

1. **功能面已经跑在需求前面。** 54 个命令模块 vs 仅 1 条活跃需求、93% backlog 完成率——需求池近乎清空，说明"再加功能"已不是当前瓶颈。最近一周提交全为协议对齐/漂移自愈/度量收敛，是典型的收口期特征。
2. **项目自建的治理体系已经开始"报自己的警"，但报告没人接，且规则本身会腐化。** `docs doctor` 10 项全绿、backlog 健康门禁通过——**这说明现存的门禁都在监控"项目是否符合自己定的规矩"，而没有一项监控"规则正文引用的代码是否还成立"**。`budget: critical`（views 占 66%）已经报出却仍是 critical；而 `architecture.md:52` 关于 R-289 的断言已被代码事实推翻（R-289 done、重复实现已消除），**规则真源没有任何机制发现这件事**——这正是我在写本报告时踩中的坑（§1.4 缺陷 1）。
3. **本次会话亲历的失败模式暴露了"空占位门禁"风险。** R-467 收口时 6 个测试失败，根因是只读 `$HOME` 导致注册库不可写——**这与项目代码质量无关，却能让一道全量测试门禁整体变红且无法区分**。更值得警惕的是：`docpath check` 把环境失败与真实回归混在同一条"测试 ❌"里，Agent（和人类）会先怀疑自己的代码。

> 一句话：**DocPath 的"内部纪律"已经强到能自我约束，但"外部可信度"还没有对应的度量与门禁。** 下一步该补的是后者。

---

## 3. 方向

### 近（当下就能动手，按优先级）

**N1. 环境可诊断性：让 check 区分"环境失败"与"代码回归"**
- 做什么：`docpath check` 在测试失败时先跑环境探针（注册库可写性、runner 可用性、`$HOME` 可写），命中则报 `check_env_exempt` 而非裸 ❌；`init` 对只读注册库给出明确修复指引而非 `attempt to write a readonly database` 堆栈。
- 为什么：本次实测的 6 个假失败就是活证据——环境问题伪装成代码回归，直接误导 Agent 的修复方向。项目已有 `looksLikeEnvironmentFailure` / `looksLikeToolchainUnavailable` 两级判定（`src/commands/check/runners.ts`），**机制已在，只是没覆盖"注册库不可写"这一类**。
- 证据：§1.4 缺陷 5；`src/commands/check/runners.ts:35-73`；`$HOME=/tmp/dphome` 下 1195/1195 全绿 vs 只读 HOME 下 6 失败。

**N2. 修复"规则真源滞后于代码"这一类漂移**
- 做什么：清掉 `.docpath/rules/architecture.md:52` 关于 R-289 的过期断言（代码已修、条目已 done）；并把这类"规则正文引用的代码/条目状态"纳入 `docs doctor` 或 `rule doctor` 的自动校验，避免再次腐化。config 双真源（同文件 gotcha 条目）作为同类项一并收敛。
- 为什么：这是本次写报告时**亲历踩中的坑**——`architecture.md` 声称 `changes-report.ts:152` 有重复实现且"R-289 待修"，实测该文件早已改为单一实现（`changes-report.ts:12` 从 `git-dirty-guard.js` 导入）、R-289 也已 `status: done`。**项目花了大力气建立"防漂移"，但规则文件对自己引用的代码没有防漂移**；Agent 读规则会去修一个不存在的问题。
- 证据：`.docpath/rules/architecture.md:52`；`src/utils/changes-report.ts:12,289`；`.docpath/backlog/archived/R-289.md`（`status: done`）。

**N3. 收掉 R-449**
- 做什么：write-spec 覆盖写告警（含 diff 与 `--force` 确认）+ 非规范 Decision Brief 章节检测。
- 为什么：它是当前**唯一活跃需求**，且直击"机器真源静默丢失"——与 N1 同属"静默失败"家族。
- 证据：`.docpath/backlog/R-449-*.md`。

### 中（阶段内交付）

**M1. 上下文预算从 critical 压回 healthy**
- 做什么：`views` 占 66%（136,664 tokens）是主因，针对性瘦身 `.docpath/workspace/` 下的渲染视图与事件流；`budget --prune` 常态化。
- 为什么：`budget: critical` 已报警但无人处理。DocPath 的核心卖点是"context injection 省 token"——**自己的上下文预算 critical 是自我否证**，对潜在采用者的说服力损害极大。
- 证据：`docpath budget --agent`（views 136,664 / 66%，events 28,981 / 14%）。

**M2. 把"内部纪律"外化为"采用者可见的证据"**
- 做什么：基于现有 `stats`/`monitor` 产出面向新采用者的**可信度凭证**——真实 Token 节省实测、门禁拦截真实缺陷的案例集（如 R-271 symlink 数据丢失事故、R-467 写穿副作用）、`check` 误报率。
- 为什么：项目已有极高质量的实战事故记录（R-273/R-277/R-288/R-467），**却只沉淀在 rules 里供自己消费**，外部看不出"这套门禁到底拦下过什么"。这是从"工程完备"跨到"可被信任"的关键一步。
- 证据：`.docpath/rules/architecture.md` 的 R-271/R-273/R-288 案例；`docpath stats` / `monitor` 已有度量底座。

### 远（中长期定位收敛）

**F1. 从"单仓工作流工具"收敛到"多 Agent 协作的状态层"**
- 做什么：强化 `worktree matrix` / `broadcast` / session 隔离，把"多 Agent 并发"从功能列表提升为产品定位主线；补齐跨 worktree 的依赖/环境隔离契约（R-467 只解决了可观测，未解决隔离本身）。
- 为什么：`product-panorama.md` 定位写的是"面向多人/多 Agent 开发团队的 AI 工作流状态层"，但当前 worktree 隔离模型仍有真实漏洞（R-467：依赖树未隔离、`changes-report` 死功能）。**定位已宣布，能力尚未兑现**。
- 证据：`docs/product-panorama.md` §1.1；R-467；`docs/features/worktree-workflow.md`。

**F2. 降低采用门槛**
- 做什么：54 个命令对新人（和 Agent）都是认知负担。评估"核心 10 命令 + 渐进披露"的入口收敛，如把 `next --agent` 真正做成唯一推荐入口。
- 为什么：`budget` 显示 `governance` 与 `rules` 各占 13%/5% 且均为 critical——**协议资产本身的体量已成为负担**，与 `product-panorama` 宣称的"轻量上下文"张力明显。
- 证据：`ls src/commands/*.ts | wc -l` = 54；`docpath budget --agent` governance critical。

---

## 4. 可执行清单

**本轮（建议立即）**

| 优先级 | 项 | 验收 |
|--------|----|------|
| P0 | N1 环境失败与代码回归分流 | 只读 `$HOME` 场景下 check 报 `check_env_exempt` 而非裸失败；`init` 给可操作指引；有回归测试 |
| P1 | N3 收掉 R-449 | 覆盖写告警 + 非规范 ADR 章节检测 + 两条回归测试（backlog 已写明验收） |
| P2 | N2 规则真源滞后治理 | `architecture.md:52` 过期断言清除；规则引用的代码/条目状态有自动校验 |

**本阶段**

| 优先级 | 项 | 验收 |
|--------|----|------|
| P1 | M1 上下文预算压回 healthy | `docpath budget --agent` 脱离 critical；views 占比显著下降 |
| P2 | N2 附：config 双真源收敛 | 新增 config 字段不再有"写了读不到"路径 |
| P2 | M2 可信度凭证 | 产出一篇基于真实 stats/事故的采用者文档 |

**中长期**

- F1 多 Agent 状态层定位兑现（含依赖隔离契约补齐）
- F2 命令面渐进披露与入口收敛

---

## 5. 证据引用表

| # | 结论 | 证据出处 |
|---|------|----------|
| E1 | 规模与时间跨度 | `git rev-list --count HEAD`；`git log --format='%ad' --date=short`；`find src -name '*.ts'`；`ls tests/*.test.mjs` |
| E2 | 测试全绿 | `node --test tests/*.test.mjs` → 1195 pass / 0 fail |
| E3 | Backlog 93% 完成、仅 1 活跃 | `docpath backlog stats`（255 条 / 238 done / 1 proposed）；`.docpath/backlog/backlog.md` |
| E4 | 文档体系健康 | `docpath docs doctor`（28 篇 / 10 项全绿；含本文索引化后复测） |
| E5 | 上下文预算 critical | `docpath budget --agent`（total 206,916；views 136,664 / 66%） |
| E6 | 规则真源滞后于代码（R-289 已 done 但规则仍称"待修"） | `.docpath/rules/architecture.md:52` vs `src/utils/changes-report.ts:12,289`；`.docpath/backlog/archived/R-289.md`（`status: done`） |
| E7 | config 双真源与优先级声明 | `.docpath/rules/architecture.md` gotcha 条目；`src/utils/config.ts:15,25,35` |
| E8 | R-449 两个静默隐患 | `.docpath/backlog/R-449-write-spec-覆盖写告警-+-非规范-decision.md` |
| E9 | 只读 HOME 致 6 测试失败 | 本次实测：`HOME=/tmp/dphome` → 1195/1195；默认 HOME → 6 fail（`attempt to write a readonly database`） |
| E10 | 产品定位与三层模型 | `docs/product-panorama.md` §1.1 / §2 |
| E11 | worktree 隔离契约与 R-467 | `docs/features/worktree-workflow.md`；R-467 提交 `2a240ea` |
| E12 | 环境失败判定机制已存在 | `src/commands/check/runners.ts:35-73` |

---

## 6. 边界 / 红线说明

本报告遵循 skill `progress-direction` 的**内嵌默认 red-lines**，未启用自定义红线：

- 未提供任何隐蔽性采纳建议、检测逃脱技、扩大投递面/规避措施、抗取证/抗溯源方向。本项目为开发者工作流工具，本就不涉及此类方向，无条目被回避。
- §3 的全部方向均限定在「工程可信度、可诊断性、文档一致性、采用门槛」范畴内。

**方法学边界（诚实声明）：**

- 本文为 `analyze` 阶段产物，**未修改任何实现代码**；§4 的落地拆分需用户确认后再走 `docpath start` / `backlog capture`。
- §1.3「进行中」仅基于 git 与 backlog 事实，不含未提交的本地意图。
- §2 的关键判断（"卡在收敛层"）是基于规模/完成率/提交主题的**推断**，非项目自陈结论，已在此显式标注。
