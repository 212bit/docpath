---
related:
  - design/project-document-placement.md
  - architecture/documentation-lifecycle-guide.md
---

# 重构方案：docpath 转型为「文档管理 + 沉淀 + 一致性校验」

> 状态：**已否决，不执行**（2026-09-06 用户裁决）
> 决策来源：2026-08-30 与用户确认起草；2026-09-06 决定不执行，仅留档
> 后续影响：R-316（project intake / learn / config 归属）不得套用本方案的定位判据，需独立论证
> 相关文档：`docs/design/command-boundaries.md`（命令边界，本方案服从其原则）

---

## 1. 目标与定位

### 转型前后

| | 转型前 | 转型后 |
| --- | --- | --- |
| 定位 | 文档驱动的工作流状态机（Document as FSM） | **文档管理 + 沉淀 + 一致性校验** |
| 管什么 | 任务走到哪了（过程） | 留下的东西对不对、能不能复用（产物） |
| UI | 无 | 由 `dsh-plugin-docpath` 提供 |
| doc-lens | 独立 dsh 插件 | **废弃，能力全部并入 docpath** |

### 目标架构

```
docpath (CLI)                    文档管理 + 沉淀 + 一致性校验
   └── 暴露 Node API
dsh-plugin-docpath (dsh 插件)     UI 层，只消费 API，不含校验逻辑
```

### 三条定位判据（用来裁决"这个功能该不该留在 docpath"）

1. **它管的是内容还是过程？** 内容 → 留；过程 → 移除
2. **它需要 UI 吗？** 需要 → 归 `dsh-plugin-docpath`
3. **它能脱离任务状态独立成立吗？** 不能 → 随 FSM 一起走

---

## 2. 重构后的模块划分与职责边界

### 分层

```
L0 内核层   core/      零依赖、纯函数、浏览器可用、可单测
L1 适配层   store/ docs/   唯一碰 fs 的地方
L2 命令层   commands/  只做参数解析与编排，不含业务逻辑
L3 输出层   output/ api.ts   --agent YAML / 人类可读 / Node API
```

### L0 内核层（纯函数，不许 import node:fs / 任何 UI）

| 模块 | 职责 | 输入 | 输出 | 来源 |
| --- | --- | --- | --- | --- |
| `core/model.ts` | 类型契约 | — | — | doc-lens `kernel/model` |
| `core/extract.ts` | 事实提取（api-paths / identifiers / regex） | 文件内容 + 提取器配置 | 事实值[] | doc-lens `kernel/extract` |
| `core/drift.ts` | 权威源 vs 下游集合比对 | 事实快照[] + 权威源 | 漂移项[] | doc-lens `kernel/drift` |
| `src/commands/register/spec.ts` | 规范规则求值 | 产物 + 规则集 | 违规项[]（含改法） | **新增** |
| `core/adjudicate.ts` | 裁决分组 + 指纹 + 台账渲染 | issues + 裁决记录 | 分组状态 / markdown | doc-lens `kernel/adjudicate` |
| `core/ledger.ts` | 需求/决策条目数据模型与状态链 | 条目 / 查询 | 条目[] | **新增**（吸收 `governance/decisions`） |
| `core/retrieve.ts` | BM25 检索排序 | 查询 + 语料 | 命中[]（含命中依据） | **新增**（替代 27 组同义词） |

### L1 适配层（node I/O，唯一碰文件系统）

| 模块 | 职责 | 来源 |
| --- | --- | --- |
| `store/config.ts` | 配置读写（含 profile 继承） | doc-lens `kernel/config` |
| `store/adjudication.ts` | 裁决落盘 `.docpath/adjudication.json` | doc-lens `kernel/adjudication` |
| `store/decisions.ts` | 决策 JSONL（机器真源）+ markdown 渲染视图 | 现有 `governance/decisions` |
| `docs/scan.ts` | 文档扫描、阶段推断 | doc-lens `kernel/scan` |
| `docs/manifest.ts` | 文档清单渲染 | doc-lens `kernel/manifest` |
| `docs/index.ts` | 文档索引与上下文索引 | 现有 `utils/document-index` 等 |

> **保留 docpath 现有"机器真源 + 人类视图"原则**：JSONL/JSON 是真源，markdown 只是渲染视图。

### L2 命令层

| 命令 | 职责 | 处置 |
| --- | --- | --- |
| `backlog` | 需求池 | **保留** |
| `journal` | 日志沉淀 | **保留** |
| `learn` | 经验沉淀 | **保留** |
| `check` | 校验门禁 | **收敛**：只留文档/规则类校验，任务状态类随 FSM 移除 |
| `lens` | 一致性校验（原 doc-lens `doctor`） | **新增**（吸收） |
| `adjudicate` | 三态裁决 | **新增**（吸收） |
| `recall` | 检索相似历史案例 | **新增** |
| `verify` | CI 硬闸门（blocking > 0 即失败） | **新增**（吸收 doc-lens `--strict` 语义） |

### L3 输出层

| 模块 | 职责 |
| --- | --- |
| `output/agent.ts` | `--agent` YAML 紧凑输出（现有协议，保持不变） |
| `output/human.ts` | 人类可读输出 |
| `api.ts` | **Node API，供 dsh-plugin-docpath 调用**（见 §4） |

---

## 3. 剥离清单（FSM 及其依赖）

### 直接移除

| 模块 | 行数 |
| --- | --- |
| `src/engine/`（state-machine / transitions / workflow-profile / lifecycle-profile 等） | 2,862 |
| `src/commands/worktree.ts` + `utils/worktree.ts` | 1,312 |
| `src/utils/git-*.ts`（安全防线） | 1,006 |
| 执行类命令（plan / done / task / tasks / runtime / status） | 1,640 |
| **小计** | **6,820** |

### 随 FSM 一并移除的校验器（对 `state.json` 有依赖）

| 验证器 | 状态依赖信号 |
| --- | --- |
| `checkPlanBreadcrumbDrift` | 5 |
| `checkMajorDecisionGate` | 4 |
| `checkContextIndexHealth` | 4 |
| `checkUiUxDesignGate` | 3 |
| `checkTaskFileDrift` | 2 |
| `validateTaskDocuments` | 2 |

### 保留（0 状态依赖，与新定位同族）

`checkRuleTruthSources`（规则真源冲突）、`checkProjectStandardsPackage`、
`checkContextHealth`、`checkDeliverablesIndex`

> **印证方向自洽**：`checkRuleTruthSources` 本是"规则真源"检查，与"一致性校验"同类。
> 剥离后 `check` 自然收敛为**文档/规则校验门禁**，无需硬塞。

**实际剥离规模：约 23–27%（6,820 直接 + 依赖的 validators/utils）。**

---

## 4. docpath ↔ dsh-plugin-docpath 接口契约

### 原则

- **docpath 不 import 任何 UI 框架**；
- **dsh-plugin-docpath 不重复实现任何校验逻辑**，只调 API；
- 契约先行，两侧并行施工。

### Node API（`api.ts`）

```ts
export interface DocPathApi {
  scan(opts: { root: string; configPath?: string }): Promise<DocReport>
  check(opts: { root: string; paths?: string[] }): Promise<CheckReport>
  adjudicate(id: string, verdict: Verdict, reason: string, by?: string): Promise<void>
  clearAdjudication(id: string): Promise<void>
  getConfig(root: string): ConfigInfo
  saveConfig(root: string, cfg: Config): void
  openFile(path: string, line?: number): void
}
```

### dsh-plugin-docpath 内部结构（复用 doc-lens 现有骨架）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| `host/` | 调用 `docpath` 的 Node API，`ctx.provide('docPath', svc)` | doc-lens `host/doc-service.ts` 改造 |
| `client/` | store（useSyncExternalStore 模式） | doc-lens `client/store.ts` 基本照搬 |
| `view/` | 面板：路径选择 + 触发按钮 + 结果分组 + 实时状态 + 裁决表单 | doc-lens `view/DocLensPanel.tsx`(461 行) **改名复用** |

---

## 5. doc-lens 能力迁移落位（逐模块）

| doc-lens 模块 | 迁移到 | 说明 |
| --- | --- | --- |
| `kernel/model.ts` | `docpath/src/core/model.ts` | 直接搬 |
| `kernel/extract.ts` | `docpath/src/core/extract.ts` | 直接搬 |
| `kernel/drift.ts` | `docpath/src/core/drift.ts` | 直接搬 |
| `kernel/adjudicate.ts` | `docpath/src/core/adjudicate.ts` | 直接搬（含 `renderAdjudicationMd`） |
| `kernel/profiles.ts` | `docpath/src/core/profiles.ts` | 规范集/配置模板 |
| `kernel/config.ts` | `docpath/src/store/config.ts` | 配置读写 |
| `kernel/scan.ts` | `docpath/src/docs/scan.ts` | 扫描 |
| `kernel/adjudication.ts` | `docpath/src/store/adjudication.ts` | 裁决落盘 |
| `kernel/analyze.ts` | `docpath/src/core/analyze.ts` | 编排 |
| `kernel/manifest.ts` | `docpath/src/docs/manifest.ts` | 清单渲染 |
| `cli.ts` | 并入 docpath CLI | `doctor`→`lens`，`--strict`→`verify` |
| `host/doc-service.ts` | `dsh-plugin-docpath/src/host/` | 改为调 docpath API |
| `client/store.ts` | `dsh-plugin-docpath/src/client/store.ts` | 照搬 |
| `view/DocLensPanel.tsx` | `dsh-plugin-docpath/src/view/DocPathPanel.tsx` | 改名复用 |
| `tests/kernel.test.ts` | `docpath/tests/` | **39 个用例整体迁移，作为重构安全网** |

---

## 6. 待决策：配置格式

doc-lens 现用仓库根 `.doc-lensrc`。并入后有两个选择：

| 方案 | 优 | 劣 |
| --- | --- | --- |
| A. `.docpathrc`（仓库根） | 与 `.doc-lensrc` 同构，迁移改动小 | 与 docpath 现有 `.docpath/` 目录惯例不一致 |
| B. `.docpath/lens.yaml` | 符合 docpath"一切都进 `.docpath/`"的惯例 | 迁移需转换格式（YAML vs JSON） |

**迁移影响**：evoucher 现有 `.doc-lensrc` 含 7 个 stages + 2 个 facts + authority map，是真实内容，需一并转换。

> ⚠️ docpath 现有规则已记录 `config.yaml 与 config.json 是两个不互通的配置真源` 的教训——
> **新增配置必须只保留一个真源**，不要重蹈覆辙。

---

## 7. 迁移顺序

| 阶段 | 内容 | 依赖 |
| --- | --- | --- |
| **0** | 定 `api.ts` 契约 + 配置格式决策 | — |
| **1** | doc-lens 内核迁入 docpath `core/`（含 39 个测试） | 阶段 0 |
| **2** | 抽 `src/utils` 常量（路径常量重复 6 次、错误文案 14 次） | 可并行 |
| **3** | 建 `dsh-plugin-docpath`（复用 DocLensPanel） | 阶段 0 |
| **4** | 剥离 FSM + 依赖它的校验器 | 阶段 1（新能力已就位） |
| **5** | 补 `spec` 规则引擎（含 `REF-001` 引用路径存在性） | 阶段 4 |
| **6** | 补 `ledger` + `retrieve`（决策沉淀 / supersedes 链 / BM25） | 阶段 4 |

**阶段 1、2、3 可并行**；阶段 4 必须等 1（新能力就位后才拆旧的）。

---

## 8. 风险与缓解

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| **dogfooding 中断** ★ | docpath 正用 docpath 开发自己（R-311/R-312/R-313 在跑），移除 FSM 会打断 | 阶段 4 排在阶段 1 之后；或等当前这批 R-xxx 收口 |
| 测试覆盖缺口 | 现有测试 19,879 行（54%），46% 无直接覆盖 | 迁移 doc-lens 的 39 个用例作为安全网；剥离前先补测试 |
| 配置真源分裂 | 新增配置可能与现有 config.yaml/json 混淆 | 见 §6，只保留一个真源 |
| 静态 import 性能 | 31 命令全量加载，`next --agent` 0.47–0.51s | 剥离后命令变少自然缓解；后续改延迟加载 |
| evoucher 迁移 | 现有 `.doc-lensrc` + 契约 + 17 条漂移 + 裁决底稿 | 配置格式定稿后一次性转换 |
