# T-20260715-docpath-init-scan-existing - docpath init --scan-existing 现有项目快速接入扫描功能

> backlog_id: R-267

## 1. 背景与动机

现有项目接入 DocPath 时，`docpath init`（src/commands/init.ts:365）写入的是模板
`.docpath/rules/architecture.md`，config.yaml 只填 framework 字符串（init.ts:425），
既不反映项目真实技术栈与目录结构，也不提取 test/build/format 命令；`docs scan`
（src/commands/docs.ts:235）默认只扫 `.docpath/` 内部，外部 README.md/docs/ 无法进索引。

这导致：(1) agent 拿不到"本项目怎么跑测试/构建"的真实命令，只能靠 CLAUDE.md 手填
或自我猜测；(2) architecture.md 与真实结构脱节，需事后用 `docpath learn` 从执行经验
回流才能补上；(3) 外部项目文档游离在 docs-index 之外，docs-index 易陈旧、检索覆盖不全。

`--scan-existing` 选项让已有项目在 init 时点一次性完成"真实目录结构扫描 → 非模板架构 →
命令提取填充 → 外部文档路径扫描"，实现不迁移/复制文件前提下的一键智能接入。

现状核实见 `.docpath/backlog/analysis/R-267-summary.md`。

## 2. 需求清单

### 功能需求

- [x] FR-1: `docpath init` 新增 opt-in 选项 `--scan-existing`/`-s`（register/core.ts 注册 + initCommand 分支），不带该 flag 时走原模板路径，不改 init 默认行为（见 §4.a/NFR-1）。
- [x] FR-2: scan-existing 分支扫描项目根目录树（去 §4.d noise），生成非模板 `.docpath/rules/architecture.md`，含真实目录结构树 + 模块边界/依赖方向摘要，写入受 §4.b 带保留初写语义约束。
- [x] FR-3: scan-existing 解析项目主流 manifest（package.json `scripts`、Cargo.toml、go.mod、pom.xml/build.gradle 等）提取 test/build/format 命令，填充 config.yaml 命令字段 + CLAUDE.md 末尾 `## 项目命令`区块；降级策略见 §4.c，CLAUDE.md 写边界见 §4.e。
- [x] FR-4: `DocPathConfig`（src/types/config.ts）新增 `document_scan_paths: string[]`，默认 `[".docpath/", "README.md", "docs/"]`，向后兼容，兜底风格同 DEFAULT_ARTIFACT_CONFIG。
- [x] FR-5: `docs scan`（docs.ts:235）读取 `document_scan_paths` 逐路径 scanDirectory 合并索引；外部路径 noise 排除见 §4.d；无该字段时仅扫 `.docpath/`（与现状一致）。
- [x] FR-6: architecture.md 写入采用带保留地初写语义（见 §4.b）——目标文件不存在或 `--force` 才写 scan 产物；已存在则跳过并打印"跳过；--force 可覆盖"提示，不读不改既有 learn/ADR 段落。

### 非功能需求

- [x] NFR-1: 向后兼容——不带 `--scan-existing` 的 init、无 `document_scan_paths` 的 config.yaml 行为与现状逐字节一致（回归基线：单项目干净 init 输出不变）。
- [x] NFR-2: 复用现有探测/detect/utils 既有能力（src/utils/detect.ts 的 type/language/framework 提取），新增 test/build 命令提取为增量扩展，不重构 detect 现有字段语义。
- [x] NFR-3: 保持与现有 DocPath 工作流兼容——scan-existing 产物路径仍落在既有 `.docpath/rules/architecture.md`、`.docpath/config.yaml`、根 `CLAUDE.md` 上，不引入新 runtime 目录。

## 3. 范围界定

### 包含
- init 的 `--scan-existing` opt-in 分支（四件事：结构扫描、arch.md 初写、命令提取填充、外部文档路径扫描接入 docs scan、config 新字段）。
- config.yaml `document_scan_paths` 字段 + docs scan 消费它。
- 五项相关单元测试（FR-1~FR-5 各一条主链路覆盖）。

### 不包含
- 不改 init 默认行为为 scan（opt-in only）。
- 不主动合并已有 learn 产出的 architecture.md 段落（只做带保留地初写，不读不改既有内容）。
- 不在 scan-existing 内做 docs-index 陈旧自愈（属 R-250 范畴）。
- 不重构 detect.ts 现有 type/language/framework 字段语义。
- 不做产品 UI（UI 设计门禁：不涉及，豁免 ui-brief/design-approval）。

## 4. 关键决策（已与用户确认）

### 4.a 重大变更门禁
本任务命中 Major-change：架构/模块边界（arch.md 写入语义）、工作流/Agent 行为（init/docs scan 行为）、写操作边界（改用户 CLAUDE.md）。已通过 brainstorm 走 major-change 门，用户显式确认下列决策。

### 4.b architecture.md 写入语义：带保留地初写（用户确认）
仅当 `.docpath/rules/architecture.md` 不存在或 `--force` 时写入 scan 产物；已存在则跳过并
打印提示（"已存在 architecture.md，跳过；--force 可覆盖"）。不读不分析既有内容，零合并逻辑，
把"是否覆盖"留给用户显式 `--force`。learn.ts:449/484 对 architecture.md 是"读 existing +
cleanedArchitecture + 追加 architectureSection"（非整体覆盖）；learn 仍以读+清理+追加写，
scan-existing 不会在 learn 写过之后抹掉它——只要 scan-existing 跑时未带 --force 且目标文件
已存在，scan 产物不落盘，与 learn 的追加语义零冲突。

### 4.c 命令提取降级策略（用户确认）
package.json `scripts.*` 直读（最规整）；Cargo/go/Java 优先用默认约定（cargo test/build、
go test/build、mvn/gradle 对应）+ 项级 Makefile/justfile/taskfile 若存在则从中聚合提取。
提取得到的命令写入 config.yaml 命令字段；**提取不到的不静默、不编造**，留空并在 CLAUDE.md
追加区块内对应位置标注 `TODO: 未探测到 <test|build|format> 命令，请确认`。

### 4.d 外部扫描 noise 排除（用户确认）
scan-existing 目录树扫描与 docs scan 扫外部路径时，默认复用项目根 `.gitignore`（忽略
node_modules/build/dist/.worktrees/.next/target 等）+ 硬黑名单兜底（node_modules、.git、
dist、build、target、.worktrees、coverage）。`document_scan_paths` 默认三路径
（.docpath/ + README.md + docs/）只读，不递归进未声明目录。

### 4.e CLAUDE.md 写边界：末尾追加区块（用户确认）
目标 CLAUDE.md 已存在 → 仅在其末尾追加一个 `## 项目命令（由 init --scan-existing 生成）`
区块，不动其他内容；不存在 → 新建并在该区块下写命令清单。重复运行 scan-existing 追加前先
移除旧的同名区块（按区块标题锚点替换），避免重复堆积。

### 4.f Decision Brief
- 当前问题: init 不反映现有项目真实结构/命令；docs scan 不覆盖外部文档。
- 目标: `--scan-existing` 一键智能接入。
- 可选方案: A 保持 backlog 范围进标准流程 / B 扩展补分析。
- 推荐方案: A。
- 决策理由: backlog 声明的 5 件验收即 scope，配合 §4.b/c/d/e 四个降级/边界决策收敛后无额外
  依赖风险；不扩大到 backlog 未声明的产品/UI 范围。
- 不做什么: 不改 init 默认行为、不合并 learn、不做 docs-index 自愈、不重构 detect。
- 成本: 中等，按 plan 拆 6 个 FR 逐步验证。
- 风险: 跨语言命令提取可靠性（§4.c 已降级）、arch.md 写入顺序（§4.b 已带保留规避）、
  外部扫描 noise（§4.d 已 gitignore+黑名单）。
- 回滚: 回滚本任务提交，或 `docpath backlog` 退回 proposed。
- 用户确认: 已确认（brainstorm 全流程五决策逐项确认）。

## 4.1 重大变更门禁
### 是否涉及重大变更
- [x] 是，需要用户确认（已通过 brainstorm 全流程确认 §4.a~§4.f）

### 变更类型
- [x] 架构 / 模块边界
- [x] 工作流 / Agent 行为
- [x] 权限 / 写操作边界

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）

## 5. 验收标准

- [x] AC-1: `docpath init --scan-existing`/`-s` 注册可见（`init --help` 列出该 option），不带 flag 时 init 行为与现状逐字节一致。
- [x] AC-2: 在含 `src/`+`package.json` 的现有项目跑 scan-existing，生成非模板 `architecture.md`（含真实目录树，去 noise）；已存在时跳过不覆盖（除非 `--force`）并打印跳过提示。
- [x] AC-3: scan-existing 解析 package.json `scripts` 写入 config 命令字段 + CLAUDE.md 末尾 `## 项目命令`区块；缺命令位置标注 `TODO: 未探测到 … 请确认`，不静默不编造。
- [x] AC-4: config.yaml 可声明 `document_scan_paths`（缺省给默认三路径），向后兼容；`review_skill_gate`/`artifacts` 读取不受影响。
- [x] AC-5: `docpath docs scan` 读取 `document_scan_paths` 扫描外部路径（README.md/docs/ 进索引），node_modules/build 等被 .gitignore+黑名单排除；无字段时仅扫 `.docpath/`。
- [x] AC-6: 新增覆盖 FR-1~FR-5 的单元测试，`pnpm test` 通过。
- [x] AC-7: scan-existing 重复运行不重复堆积 CLAUDE.md 命令区块（按标题锚点替换旧区块）。
