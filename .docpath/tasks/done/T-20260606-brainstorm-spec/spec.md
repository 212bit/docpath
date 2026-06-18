# T-20260606-brainstorm-spec - 增强 brainstorm 生成可执行 spec 草稿与澄清问题

> backlog_id: R-089
> backlog_source: docpath backlog add

## 1. 背景与动机

## 背景

- DocPath 已有 `brainstorm` 命令，但当前主要输出苏格拉底式 prompt，`--dry-run` 只预览现有 spec，不能直接帮助用户把一句模糊需求转成可执行 spec 草稿。
- 最近多个 backlog promote 生成的 spec 仍包含“待补充”，导致后续 plan 容易退化成泛化步骤。
- 需要在需求入口处提供轻量但结构化的澄清能力：先识别缺失信息，再给出默认假设和可复制到 `write-spec` 的 spec 草稿。

## 验收

- `docpath brainstorm --input <text> --dry-run` 能输出澄清问题、默认假设和 Markdown spec 草稿，且不写任何文件。
- 常规 `docpath brainstorm --input <text>` 继续输出 Agent prompt，但 prompt 中包含澄清问题、默认假设和 spec 草稿要求。
- 从文件读取需求的路径保持兼容，缺失文件继续 fail loud。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `brainstorm --dry-run` 基于 input 或 file 生成结构化需求分析输出
  - 输出必须包含“澄清问题”“默认假设”“Spec 草稿”三个部分。
- [ ] FR-2: Spec 草稿使用现有 `write-spec` 可接受的 Markdown 结构
  - 包含背景、功能需求、非功能需求、范围界定、关键决策、验收标准。
- [ ] FR-3: 常规 brainstorm prompt 应指导 Agent 先澄清再写 spec
  - prompt 中显式要求输出澄清问题、默认假设和最终 spec 草稿。
- [ ] FR-4: 支持 `--input` 与 `[file]/--file` 两种需求来源
  - 指定文件时沿用 `readRequirementFile` 的 fail-loud 行为。

### 非功能需求
- [ ] NFR-1: 保持现有 DocPath 工作流兼容
- [ ] NFR-2: dry-run 必须无副作用，不修改 `state.json`、`current.md`、`spec.md` 或 breadcrumb
- [ ] NFR-3: 不引入外部 LLM 或网络依赖，使用确定性本地生成逻辑

## 3. 范围界定

### 包含
- 改造 `src/commands/brainstorm.ts` 的 dry-run 输出
- 增强常规 brainstorm prompt 指令
- 增加 brainstorm CLI 测试，覆盖 input、file、无副作用和缺失文件失败

### 不包含
- 自动写入 spec；写入仍通过 `docpath write-spec`
- 自动创建 backlog 或 promote backlog
- 引入交互式问答状态机或多轮会话存储

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | backlog promote seed spec | 保留 backlog 作为来源 | 采用 | 便于后续 plan/go 接续 |
| 2 | dry-run 行为 | 预览现有 spec / 生成分析草稿 | 生成分析草稿 | dry-run 更适合做无副作用需求入口质量检查 |
| 3 | 生成方式 | 本地确定性模板 / 外部 LLM | 本地确定性模板 | 保持 CLI 可测试、可离线、稳定输出 |

## 5. 验收标准

- [ ] AC-1: `brainstorm --input "做一个导出功能" --dry-run` 输出澄清问题、默认假设和 `## 1. 背景与动机` 等 spec 章节
- [ ] AC-2: `brainstorm req.md --dry-run` 能读取文件内容并生成同样结构化输出
- [ ] AC-3: dry-run 执行前后 `state.json`、`current.md`、`tasks/current/spec.md` 内容不变
- [ ] AC-4: `brainstorm missing.md --dry-run` 失败且输出文件读取错误，不静默回退空需求
- [ ] AC-5: 非 dry-run 的 brainstorm prompt 包含澄清问题、默认假设和 spec 草稿输出要求
- [ ] AC-6: `pnpm test`、`docpath check`、`docpath review` 全部通过

---

*此文件由 `docpath backlog promote` 生成，并在任务启动时补齐需求细节。*
