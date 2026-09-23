# T-20260923-agent-step-note-shell - agent step 反引号被 shell 命令替换导致文字静默消失

> backlog_id: R-359

## 1. 背景与动机

`docpath agent step --note "..."` 的 note 值若含反引号（或 $、! 等 shell 特殊字符），在 shell 里会被命令替换/展开执行，导致那段文字静默消失，工具收到的是被处理后的残缺字符串。反引号是 shell 层行为，工具收不到原始串，无法在运行时转义；根治方式是提供绕开 shell 特殊字符的传入通道。

## 2. 需求清单

### 功能需求
- [x] FR-1: agent step / enter / done 的 note 支持 --stdin（从标准输入读取）与 --body-file <path>（从文件读取），绕开 shell 特殊字符处理
- [x] FR-2: 当 --note 与 --stdin/--body-file 同时出现时，以后者为准并给出提示

### 非功能需求
- [x] NFR-1: 不影响现有 --note 单行用法

## 3. 范围界定

### 包含
- agent 子命令 CLI 选项增加 --stdin / --body-file（复用 src/utils/stdin.ts）
- handleAgentStep / handleAgentEnter / handleAgentDone 在解析 note 时优先采用 stdin/body-file

### 不包含
- 修改 shell 行为（做不到）；修改 note 存储格式

## 4. 关键决策

| # | 决策 | 结论 | 理由 |
|---|------|------|------|
| 1 | 根治方式 | 加 --stdin/--body-file | 反引号是 shell 层，工具侧只能提供绕开通道 |

## 5. 验收标准

- [x] AC-1: 含反引号的 note 经 --stdin 传入后，breadcrumb/plan 中完整保留原文字（不被命令替换）
- [x] AC-2: --note 与 --stdin 同现时后者优先
- [x] AC-3: 现有 --note 单行用法不受影响
