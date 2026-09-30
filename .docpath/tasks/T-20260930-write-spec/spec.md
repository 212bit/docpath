# T-20260930-write-spec - write-spec 前置暴露结构契约并在校验失败时附可复制最小骨架

> backlog_id: R-448
> backlog_source: docpath backlog add

## 1. 背景与动机

agent+docpath 辅助开发中，write-spec --help 仅列 --cwd/--content/--stdin 三个选项，不暴露硬性结构契约（doc-parser.ts:61-101 要求 `# 任务标题`、`### 功能需求`、`## 5. 验收标准`，且 FR-*/AC-* 必须为 `- [ ] FR-1:` checkbox 形式）。R-129 会话中 agent 因拿不到契约只能猜格式，连续三次调用 write-spec：第1次以 backlog_id: 开头无 `# ` 标题、缺 `## 5. 验收标准`、缺 AC-* → 校验失败 exit 1；第2次 FR/AC 写成裸 `- FR-1:` 未用 checkbox → 校验失败 exit 1；第3次补 checkbox 才成功。前两次零副作用（校验在 write-spec.ts:117 位于写文件之前，exit 1 即无写入），但整份 spec 正文被重复注入两遍，浪费上下文。

## 2. 需求清单

### 功能需求
- [ ] FR-1: `docpath write-spec --help` 输出新增 Examples 段，给出最小可过校验的 spec 骨架；骨架须覆盖全部五条硬性结构契约（`# 任务标题` / `### 功能需求` / `## 5. 验收标准` / `- [ ] FR-N:` / `- [ ] AC-N:`），骨架内 ADR 位使用 `## 4.1 重大变更门禁 > ### Decision Brief` 规范写法
- [ ] FR-2: 结构校验失败时（validateSpecOrExit 分支），除逐条列 issue 外额外打印可直接复制复用的最小骨架模板，使 agent 一次调用即可自行修正

### 非功能需求
- [ ] NFR-1: 成功写入路径的输出保持现状不变，不新增噪音（仅在失败分支与 --help 输出新增内容）
- [ ] NFR-2: 骨架内容与 doc-parser.ts 的校验规则保持单一真源，避免帮助文本与校验逻辑漂移

## 3. 范围界定

### 包含
- src/commands/register/spec.ts 的 write-spec --help 描述
- src/commands/write-spec.ts 的 validateSpecOrExit 失败输出

### 不包含
- 覆盖写告警与非规范 ADR 位检测（属 R-449，本任务不实现）
- 改动 validateSpecContent 本身的校验规则

## 4. 关键决策

| # | 决策 | 选项 | 结论 | 理由 |
|---|------|------|------|------|
| 1 | 骨架常量落位 | 落在 write-spec.ts / 独立常量模块 | 落在 write-spec.ts 并导出，供 register/spec.ts 复用 | 与校验逻辑同文件，降低帮助文本与校验规则漂移风险 |
| 2 | 改动范围 | 同时改校验规则 / 只暴露契约 | 只暴露契约，不改规则 | 改规则会改变既有 spec 合法性判定，属行为变更，超出本需求 |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [x] 否
- [ ] 是，需要用户确认

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
- [ ] 工作流 / Agent 行为
- [ ] 权限 / 写操作边界
- [ ] 范围扩大
- [ ] 删除 / 替换已有能力
- [ ] 长期维护成本增加
- [ ] 其他

### UI 设计门禁
- [x] 本任务不涉及产品 UI 实现（豁免 UI/UX 设计证据包）
- [ ] 本任务涉及产品 UI 实现并显式开启 UI/UX 设计流程（go 前必须有 ui-brief.md + 已批准 design-approval.md）

### Decision Brief
- 当前问题: agent 拿不到 write-spec 的结构契约，靠猜格式反复试错重写，整份 spec 正文被重复注入上下文
- 目标: 让契约在 --help 与校验失败输出两处前置可见，agent 一次写对
- 可选方案:
  - 方案 A: 只改帮助文本与失败输出，不动校验规则
  - 方案 B: 同时放宽校验规则，兼容裸 `- FR-1:` 写法
- 推荐方案: 方案 A
- 决策理由: 方案 B 会改变既有 spec 的合法性判定属行为变更，且放宽后 FR/AC 无法被 structured-docs 解析进 spec.json 机器真源，反而制造新的静默丢失；方案 A 零行为风险且直击病灶（契约不可见）
- 用户确认: 用户已确认走标准生命周期实施 R-448

## 5. 验收标准

- [ ] AC-1: `docpath write-spec --help` 输出含 Examples 段与最小可过校验 spec 骨架
- [ ] AC-2: 校验失败输出除 issue 列表外附可复制最小骨架
- [ ] AC-3: 成功写入路径输出与现状一致，无新增噪音
- [ ] AC-4: 骨架通过 write-spec 自身校验（骨架直接喂入可成功写入）
