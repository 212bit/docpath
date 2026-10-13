## 执行计划

### S1: 实现并验证 `docpath write-spec --help` 输出新增 Examples 段，给出最小可过校验的 spec 骨架；骨架须覆盖全部五条硬性结构契约（`# 任务标题` / `### 功能需求` / `## 5. 验收标准` / `- [ ] FR-N:` / `- [ ] AC-N:`），骨架内 ADR 位使用 `## 4.1 重大变更门禁 > ### Decision Brief` 规范写法
- [x] S1: 实现并验证 `docpath write-spec --help` 输出新增 Examples 段，给出最小可过校验的 spec 骨架；骨架须覆盖全部五条硬性结构契约（`# 任务标题` / `### 功能需求` / `## 5. 验收标准` / `- [ ] FR-N:` / `- [ ] AC-N:`），骨架内 ADR 位使用 `## 4.1 重大变更门禁 > ### Decision Brief` 规范写法
- **描述**: 完成 FR-1: `docpath write-spec --help` 输出新增 Examples 段，给出最小可过校验的 spec 骨架；骨架须覆盖全部五条硬性结构契约（`# 任务标题` / `### 功能需求` / `## 5. 验收标准` / `- [ ] FR-N:` / `- [ ] AC-N:`），骨架内 ADR 位使用 `## 4.1 重大变更门禁 > ### Decision Brief` 规范写法；FR-2: 结构校验失败时（validateSpecOrExit 分支），除逐条列 issue 外额外打印可直接复制复用的最小骨架模板，使 agent 一次调用即可自行修正，随做随验（level-1 压缩计划，R-306）。
- **验收条件**: AC-1: `docpath write-spec --help` 输出含 Examples 段与最小可过校验 spec 骨架；AC-2: 校验失败输出除 issue 列表外附可复制最小骨架；AC-3: 成功写入路径输出与现状一致，无新增噪音；AC-4: 骨架通过 write-spec 自身校验（骨架直接喂入可成功写入）
- **依赖**: 无

## Checklist
- [x] S1

## 依赖关系图
S1
