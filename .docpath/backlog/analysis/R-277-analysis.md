# R-277 分析: R-273 契约修正的模板层缺口 (2026-07-17, install-manifest-drift 诊断)

## 发现路径

install_health 自 2026-07-10 起持续报 install-manifest-drift (errors: 1)。
`docpath install --check`: 模板 0 项 / 缺失 0 项 / 本地改动 1 项 (CLAUDE.md)。
逐层 diff 后确认: 本地 CLAUDE.md 是对的 (R-269 归档语义 + R-273 裁定契约),
**模板层与部分已装副本是旧的**——"本地改动"实为用户确认修正未回灌安装源。

## 漂移面清单 (逐文件核验)

| 文件 | 状态 | 内容 |
| --- | --- | --- |
| templates/CLAUDE.md (install 的 CLAUDE.md 真源, resolveTemplate 根优先) | 漂移 | Worktree Isolation 段仍写 "option C: hybrid per-subtree tracking" + "Live-shared symlink, backlog gitignored in main"——R-271 致 P0 被 R-273 回滚的契约原文 |
| templates/protocols/CLAUDE.md (整目录装到 .docpath/protocols/) | 更旧 | 整体缺 journal/gc 归档语义段 (81 行 diff) 与全部 Worktree 章节 |
| templates/CODEX.md / templates/OPENCODE.md | 最旧 | "Shared resources (via symlink): backlog + rules"——连 rules 也 symlink, 早于 R-238 |
| CODEX.md / OPENCODE.md (根目录已装副本, Codex/OpenCode 会话实际读取) | 同上 | 与模板同源的 stale 文本 (via symlink) |
| docs/features/worktree-workflow.md | 主体已修 | R-273 已改正文与契约历史 (L232/286/295); 残留 L31/L555 ASCII 图 "backlog -> ... ← symlink 真共享" 与 L209 "创建共享资源 symlinks" 步骤描述 |
| .docpath/protocols/*.md | 干净 | 无 symlink 契约文本 (但重装后会被 protocols 模板刷新, 需模板先修) |
| CLAUDE.md (本地) / AGENTS.md | 正确 | 本地 CLAUDE.md 即目标文本; AGENTS.md 无 worktree 章节且在 manifest 豁免名单 (isLocallyCustomizableInstallAsset) |

## 危害

1. `docpath install --target universal` 是 CLI 每次路由都在推荐的修复命令 (install_health.recommended_command), 现在执行会用**致 P0 的旧契约覆盖已修正的本地 CLAUDE.md** (installProtocolFile 直接以模板渲染覆写)。
2. Codex/OpenCode 会话读根副本协议即获错误契约——与 R-271 事故根因同模式 (rules common-mistake: "R-271 依据 CLAUDE.md 仍写着的 live-shared 描述做实现")。
3. install-manifest-drift 长期红着, 掩蔽未来真实的安装漂移信号。

## 修法 (无新决策, R-273 FR-4 的模板层补全)

- FR-1: templates/CLAUDE.md Worktree Isolation 段回灌 R-238 Option B/R-273 文本 (与本地 CLAUDE.md 对齐)。
- FR-2: templates/protocols/CLAUDE.md 补 journal/gc 语义段与 Worktree 章节, 与根模板对齐。
- FR-3: templates/CODEX.md、templates/OPENCODE.md 的 "via symlink" 资源段改为 merge-mediated/isolated 两类 (与 CLAUDE.md 契约一致的精简版)。
- FR-4: docs/features/worktree-workflow.md L31/L555 ASCII 图与 L209 步骤描述改为 tracked 副本表述。
- FR-5: 模板修正后执行 docpath install --target universal 刷新根副本 (CODEX.md/OPENCODE.md 获得正确契约; CLAUDE.md 覆写前后 byte-identical) 与 manifest; `docpath install --check` 通过。

## 验收

- AC-1: 全仓 grep "via symlink"/"Live-shared"/"option C" 在协议模板/已装副本零命中 (docs 契约历史小节的警告性提及除外)。
- AC-2: install --check 通过; next/status 的 install_health passed=true, errors=0。
- AC-3: 重装前后本地 CLAUDE.md 内容不变 (byte-identical)。
- AC-4: pnpm test 全绿 (install.test.mjs 回归)。

## 用户确认依据

契约本身经 R-238 (7b3f9f0 Option B) 与 R-273 (ADR-20260716-011 方案 B, 回滚 R-271) 两度用户裁定;
本条目不引入新决策, 仅把已裁定文本回灌漏改的模板/副本/图示。
