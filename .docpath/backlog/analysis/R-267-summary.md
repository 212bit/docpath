# R-267 现状与可行性分析 — docpath init --scan-existing 现有项目快速接入

> 2026-07-15 现场代码核实。Read-only 分析，用于把 R-267 从 `readiness: shaped`
> 推进到 `analyzed`，为 level 2 入口填 `evidence.analysis`，作为 promote 前置门控。

## 1. R-267 验收条款逐项现状

### ① `init --scan-existing/-s` 选项
- **现状**：`src/commands/register/core.ts:23-33` 注册的 `init` 仅有
  `--cwd/--force/--level/--link/--interactive` 五个选项，无 `--scan-existing`。
- **判定**：全新能力，无现成入口。需在 register/core.ts 与 `initCommand` 之间新增 option，
  并在 `initCommand` 里走一条"扫描接入"分支（区别于当前"模板写死"分支）。

### ② 扫描现有项目，生成非模板化 `architecture.md`（含真实目录结构树）
- **现状**：`src/commands/init.ts:365` 仍是
  `writeFileSafe(...architecture.md, await loadTemplate(.../architecture.template.md))`，
  即 init 时点**写的是模板**，真实结构靠事后 `docpath learn`（src/commands/learn.ts）
  从 journal 提取经验回流到 `style.md/architecture.md`。
- `src/commands/check/validators.ts:643-647` 的 `architecture.md` 探测只是健康检查
  （找不到就警告），不负责生成。
- **判定**：init 时点的"扫描真实目录树 → 生成 architecture.md"能力缺失。
  R-267 与 `learn` 的关系需在 analysis 里界定（见 §4 边界）：
  `learn` 是**事后**从执行经验回流，R-267 是**接入时点**从静态结构扫描，两者入口不同、
  不可互相替代，但都写 `architecture.md`，存在"谁先写/谁覆盖"的写入顺序边界。

### ③ 解析 package.json/go.mod/Cargo.toml 等，自动寻找 test/build/format 命令，
   填充 CLAUDE.md 与 config.yaml
- **现状**：技术栈探测源头是 `src/utils/detect.ts`，提取字段只有 `type`/`language`
  /`framework` 三个（detect.ts:88-262 全分支）。**完全不读 `pkg.scripts.test/build`、
  Cargo.toml 的 `[[bin]]`、go.mod 旁的 Makefile**——,test/build 命令零提取。
  `src/commands/init.ts:399/425` 仅把 `framework` 字符串写进 config.yaml 的
  `project.framework`。
- **判定**：真实 gap 且影响面最大。这决定 R-267 的核心价值——让 DocPath 自动知道
  "本项目 test 怎么跑、build 怎么跑"，目前 agent 只能从 CLAUDE.md 里手填或自己猜。

### ④ config.yaml 新增 `document_scan_paths` 字段（默认
   `[".docpath/", "README.md", "docs/"]`），`docs scan` 读它并扫描外部路径
- **现状**：`src/types/config.ts:28-48` 的 `DocPathConfig` 只有 `artifacts` 与
  `review_skill_gate` 两块，**无 `document_scan_paths`**。
  `src/commands/docs.ts:230-248` 的 `docsScan` 写死
  `scanDirectory(docpathDir, docpathDir)`——**只扫 `.docpath/` 内部**，
  外部 README.md/docs/ 完全不进索引（这正是 docs-index 易"陈旧/缺外部文档"的结构性
  原因，与 R-250 的 docs-index 主题相关但不同维度）。
- **判定**：全新 config 字段 + docs.ts 扫描范围扩展。需扩展 `DocPathConfig` 类型、
  提供默认值、并让 `docsScan` 读取该字段拼路径后逐个 scanDirectory。

### ⑤ 单元测试覆盖扫描/提取/写入一致性
- **现状**：无。仓库 tests/ 下无 init scan-existing 相关用例
  （`init.test.mjs` 覆盖的是模板生成与 doctor 自愈路径）。
- **判定**：随实现新增，属交付物。

## 2. 与既有 backlog / 已实现功能的关系（非依赖，关联）

- **与 R-250（check 报 docs-index 陈旧无自愈）**：第④件让 `docs scan` 能扫外部路径，
  从源头扩大 docs-index 覆盖面，降低"陈旧"触发频率；但 R-250 关注的是**陈旧后的自愈
  流程**，二者不替代。R-267 修扫描范围，R-250 修自动重建，互补可同向推进。
- **与 R-263（promote/write-spec 真源同步语义未前置化）**：本条若 promote 成 task，
  其 FR checklist 须确保进 spec.json（避免 R-263 描述的真源漂移），属 R-263 痛点的
  一次具体规避场景，不是 R-263 的替代。
- **与 `learn`（src/commands/learn.ts）**：见 §1② 边界——接入点扫描 vs 事后回流，
  两条写入 architecture.md 的路径，需在 spec 里明确顺序与覆盖语义。

## 3. level 2 readiness 门控合规

R-267 当前 frontmatter：`level: 2, readiness: shaped, evidence.analysis: null`。
按 `assertBacklogReadyForExecution`（src/commands/backlog.ts:278），level≥2 promote 前应
`readiness: analyzed` + `evidence.analysis` 已填。本文件即为该 analysis 证据；promote 前
还需 `docpath backlog edit R-267 --readiness analyzed --evidence-analysis
.docpath/backlog/analysis/R-267-summary.md`，且按 backlog.ts:287 的 level≥3 user_confirmed
要求（本条 level 2，不强制，但 §6 建议有用户确认更稳）。

## 4. 实现边界与风险

- **写入顺序风险**：`--scan-existing` 生成的 architecture.md 与模板/learn 产物同名路径
  `.docpath/rules/architecture.md`。需明确 scan-existing 模式下"覆盖模板 / 仅首次写 /
  与已有 learn 产物合并"的语义，避免抹掉既有经验。建议 spec 里定一个明确的合并策略
  （例如 scan-existing 仅在文件不存在或 `--force` 时写，且保留既有 ADR/learn 段落）。
- **跨语言 command 提取可靠性**：package.json 的 scripts 最规整；Cargo.toml/go.mod
  的 test/build 多依赖 cargo test / go test 默认约定 + Makefile，提取需有降级策略
  （探测不到命令时留占位 + 让 agent/用户确认），不能假装总提取得到。
- **document_scan_paths 与 .gitignore**：`docs scan` 扫外部 docs/ 时需避免把
  node_modules/、build/ 这类 noise 误纳，建议默认带忽略规则或复用项目 .gitignore。
- **config 兼容**：新增 `document_scan_paths` 字段对已有 config.yaml 是叠加（向后兼容），
  不破坏既有 `artifacts`/`review_skill_gate` 读取，merge 走 `mergeArtifactConfig` 同款
  默认值兜底风格，缺省给 `[".docpath/", "README.md", "docs/"]`。

## 5. 验收正文瑕疵

R-267.md 的"验收"正文把 `\n` 作为字面字符写入（`"...。 \n2. ..."`），是 backlog
add/capture 的 body 处理小瑕疵。promote 前应 `backlog edit` 把验收条目还原为正常
markdown 多行，避免 spec 阶段 FR checklist 解析异常。

## 6. 结论与 promote 建议

- R-267 **不是 superseded**：5 件事里 ②③④ 全是真实 gap（init 写模板、detect 不提
  commands、docs scan 不扫外部、config 无新字段），与既有功能有实质差距，保留有价值。
- **不切分**：5 件事是对"现有项目一键智能接入"这一**单一用户场景**的连贯能力
  （同一入口 `init --scan-existing` 下完成 技术栈探测→真实结构→命令提取→文档扫描路径
  →测试覆盖），切分会破坏场景闭环。维持 level 2 单 task 推进。
- **promote 前置**：先修 §5 验收正文瑕疵 →`backlog edit` 登记 readiness: analyzed
  与 evidence-analysis（本文件）→（建议）补 user_confirmed → 走标准 promote。
- **scope 边界**：实现时须明确 §4 的 architecture.md 写入顺序与跨语言提取降级策略，
  这两条是 R-267 真正的难点，须进 spec 的 FR + 风险段，否则 review 阶段易被 R-255 family
  的"scope mismatch / 证据元数据"问题卡。
