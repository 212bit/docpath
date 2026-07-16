# T-20260716-r-273-p0-symlink-install-claude-md - R-273 契约修正未覆盖模板层: 协议模板/已装副本仍文档化致 P0 的 symlink 共享, install 会用旧契约覆盖已修正的 CLAUDE.md

> backlog_id: R-277
> backlog_source: docpath backlog capture

## 1. 背景与动机

install-manifest-drift 诊断时发现 (2026-07-17, analysis:
.docpath/backlog/analysis/R-277-analysis.md): R-273 修正了 CLAUDE.md 与 docs
主体, 但模板层漏改——templates/CLAUDE.md 仍写 option C live-shared symlink
(R-271 致 P0 被回滚的契约原文); templates/protocols/CLAUDE.md 整体缺 journal/gc
语义段与 Worktree 章节; templates/CODEX.md、templates/OPENCODE.md 及已装根副本
写更旧的 "backlog+rules via symlink"; docs L31/L555 ASCII 图与 L209 步骤残留。
危害: CLI 反复推荐的 docpath install 会用致 P0 旧契约覆盖已修正的本地 CLAUDE.md;
Codex/OpenCode 会话读根副本即获错误契约 (R-271 事故根因模式)。

## 1.1 已有证据

### 深度分析摘要 (analysis)

.docpath/backlog/analysis/R-277-analysis.md

## 2. 需求清单

### 功能需求
- [x] FR-1: templates/CLAUDE.md Worktree Isolation 段回灌 R-238 Option B/R-273 文本 (与本地 CLAUDE.md byte-identical 对齐)。
  - 来源 backlog: R-277
- [x] FR-2: templates/protocols/CLAUDE.md 补 journal/gc 语义段与 Worktree 章节, 与根模板对齐。
- [x] FR-3: templates/CODEX.md、templates/OPENCODE.md 的 "via symlink" 资源段改为 merge-mediated/isolated 契约一致精简版。
- [x] FR-4: docs/features/worktree-workflow.md L31/L555 ASCII 图与 L209 步骤描述改为 tracked 副本表述。
- [x] FR-5: docpath install --target universal --force 刷新根副本 (CODEX/OPENCODE 获得正确契约) 与 manifest; AGENTS.md 本地定制 (Git Convention 章节) 属豁免资产, 覆写后已从 HEAD 恢复且 check 仍通过。

### 非功能需求
- [x] NFR-1: 保持与现有 DocPath 工作流兼容 (install.test.mjs 31 用例 + 全量回归)

## 3. 范围界定

### 包含
- templates/{CLAUDE,CODEX,OPENCODE}.md 与 templates/protocols/CLAUDE.md
- docs/features/worktree-workflow.md 三处残留
- 重装刷新: CODEX.md/OPENCODE.md/AGENTS.md 根副本、.docpath/{protocols,workflows,skills,commands}、.install-meta.json

### 不包含
- AGENTS.md 模板内容变更 (无 worktree 章节; 本地 Git Convention 定制经豁免机制保留)
- install --force 对豁免资产的覆写警告机制 (已另捕获 R-278)
- install 覆写保护/三方合并机制

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 漂移方向判定 | 本地回退到模板 / 模板回灌本地 | 模板回灌本地 | 本地 CLAUDE.md 承载 R-269/R-273 两次用户确认修正; 模板是旧契约 (R-271 P0 原文) |

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
- [ ] 架构 / 模块边界
- [ ] UI 信息架构 / 用户主路径
- [x] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: 协议模板与已装副本仍文档化 R-271 致 P0 的 symlink 共享契约, install 会用旧契约覆盖已修正的 CLAUDE.md。
- 目标: 模板层与全部已装副本对齐 R-238 Option B/R-273 裁定契约; install_health 清零。
- 可选方案:
  - 方案 A: 模板回灌已裁定文本 + --force 重装刷新副本与 manifest
  - 方案 B: 仅改本地副本不动模板 (下次 install 复发)
  - 方案 C: 把 CLAUDE.md 加入豁免名单 (掩蔽真实漂移, 模板仍带毒)
- 推荐方案: 方案 A
- 决策理由: 契约文本本身已经 R-238/R-273 两度用户裁定, 本任务零新决策; 只有回灌模板才能杜绝 install 复发与新项目带毒。
- 不做什么: 不改契约语义; 不动 AGENTS.md 模板; 不做覆写保护机制 (R-278 另议)。
- 成本: 低——纯文档回灌 + 重装。
- 风险: --force 覆写豁免资产 AGENTS.md 的本地定制——已发生并从 HEAD 恢复, check 经豁免机制仍通过; 该体验缺口另捕获。
- 回滚方案: 回滚本任务提交, 模板与副本回到旧文本 (install_health 重新报错)。
- 用户确认: 契约经 R-238 (7b3f9f0 Option B) 与 R-273 (ADR-20260716-011 方案 B, 回滚 R-271) 两度用户裁定; 本任务无新决策, 仅把已裁定文本回灌漏改的模板层; 本会话用户指示"继续"清余量。

## 5. 验收标准

- [x] AC-1: 全仓 grep "via symlink"/"Live-shared"/"option C" 在协议模板/已装副本零命中 (契约警示句 "do NOT symlink" 除外)。
- [x] AC-2: docpath install --check 通过 (141 assets); next/status 的 install_health passed=true, errors=0 (2026-07-10 以来首次清零)。
- [x] AC-3: 重装前后本地 CLAUDE.md sha256 一致 (byte-identical)。
- [x] AC-4: pnpm test 全绿 (644/644, install.test.mjs 31 用例回归)。

---

*此文件由 `docpath backlog promote` 生成。*
