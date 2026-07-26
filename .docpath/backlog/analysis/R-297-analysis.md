# R-297 Analysis — 协议单源：templates/protocols 为唯一手写层，重复层删除

> 用户 2026-07-27 选定方案 A（层间单源）；管线精读后按 A 的意图收敛为「删除重复层」而非「同步重复层」。

## 1. 勘察结论

### flavor 间（不处理）
CLAUDE/AGENTS/CODEX/OPENCODE 是同一契约的不同措辞重写（AGENTS∩CLAUDE 仅 9% 行重叠，四方共有仅 10 行），非文本复制。语义级共享段注入为后续独立条目（方案 B），本任务不动 flavor 内容关系。

### 层间治理现状
- root ↔ templates/<flavor>.md：**已被治理**——install 的 buildExpectedInstallAssets（install-core.ts:204-215）从 templates/<flavor>.md 渲染 {{PROJECT_NAME}} 生成 root 文件，manifest drift 检测在位。
- templates/<flavor>.md ↔ templates/protocols/<flavor>.md：**无人治理**，R-277 事故层。实锤三处：
  1. protocols/OPENCODE.md 缺失整段 Worktree 并发开发章节（71 行，templates 侧领先——R-283 方向判定）；
  2. templates/AGENTS.md 将 {{PROJECT_NAME}} 写死为 "docpath"（install 到其它项目会漏入本仓库名；参数化正确版在 protocols 侧）；
  3. CODEX 无 protocols 层副本（层结构不完整）。
- templates/protocols/ ↔ .docpath/protocols/：install 的 protocols group 逐字分发，已治理。

## 2. 方案（A 收敛版：删层）

1. **canonical 源 = templates/protocols/<flavor>.md（4 份，参数化）**：
   - 补建 protocols/CODEX.md（自 templates/CODEX.md）；
   - 修复 protocols/OPENCODE.md：并入 templates 侧领先的 worktree 章节（方向：本地/templates 领先→回灌源）；
   - AGENTS 以 protocols 参数化版为准。
2. **消费方改读 canonical**：
   - install-core buildExpectedInstallAssets 的 entryProtocolFiles 循环改 resolveTemplate('protocols', filename)；
   - init 的 writeInitialTemplates 同步改读 protocols/CLAUDE.md；
   - R-277 全链检索其它 templates/<flavor>.md 读点（代码/docs/tests）。
3. **删除 templates/{CLAUDE,AGENTS,CODEX,OPENCODE}.md** 重复层。
4. **防复辟**：测试断言 templates 根层无 flavor 协议文件 + install 期望资产内容来自 protocols 源。
5. root 副本与 .docpath/protocols 分发机制不变（沿用 install manifest drift 治理）；本仓库 root 文件按新源 install --force 刷新一次并核对 diff。

## 3. 验收

- AC-1: 协议契约的手写层唯一（templates/protocols/，4 flavor 齐全参数化）；templates 根层 flavor 文件删除且有防复辟断言。
- AC-2: install（各 target）期望资产与 manifest 内容等价迁移：root 渲染含正确项目名（AGENTS 写死名修复），.docpath/protocols 分发不变；install/doctor 测试全绿。
- AC-3: protocols/OPENCODE.md 补齐 worktree 章节，与 root/templates 语义一致；R-290 修正在 4 份源中保持。
- AC-4: init 新工作区生成的 CLAUDE.md 与 install 同源；全量套件绿。

## 4. 风险与回滚

- 风险：遗漏 templates/<flavor>.md 读点（R-277 模式）——以全链 grep + 全量测试兜底；install manifest source 标识变化可能触发一次性 drift 报告——manifest source 字段随迁移更新。
- 回滚：revert 单提交；删除的 4 文件可从 git 恢复。
