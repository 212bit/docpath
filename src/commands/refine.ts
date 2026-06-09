/**
 * docpath:refine — 从需求文档梳理为标准 spec.md
 *
 * Prompt-only 模式：CLI 读取用户提供的需求文档，输出结构化 prompt；
 * 宿主 Agent 负责生成规范需求信息，再用 docpath write-spec 写入并继续 plan。
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import { readRequirementFile } from '../utils/input.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { readActiveAnalysisSummary } from '../utils/task-files.js';

interface RefineOptions {
  cwd: string;
  /** 需求文档路径 */
  file?: string;
  /** 直接传入的需求内容 */
  content?: string;
  /** 从 stdin 读取需求内容 */
  stdin?: boolean;
  /** 只预览输入，不更新状态 */
  dryRun?: boolean;
}

const REFINE_SYSTEM_PROMPT = `你是资深产品需求分析师和技术规格整理专家。你的任务是把用户提供的原始需求文档梳理为 DocPath 标准 spec.md。

目标：
1. 保留原始需求中的明确事实，不凭空编造
2. 把散乱描述整理为可执行、可验收、可继续规划的需求信息
3. 明确标注缺失信息、风险和待确认问题
4. 输出可以直接写入 .docpath/tasks/current/spec.md 的 Markdown

整理规则：
- 功能需求使用 FR-n 编号，每条必须可被实现或验证
- 非功能需求使用 NFR-n 编号，覆盖性能、安全、兼容性、可维护性等约束
- 验收标准使用 AC-n 编号，必须是可检查的结果
- 范围界定必须包含“包含 / 不包含 / 待确认”
- 若原文有冲突，放入“关键决策/待确认问题”，不要自行裁决
- 若信息不足以生成执行计划，仍输出 spec，但在“待确认问题”中列出阻塞点

输出必须是纯 Markdown，不要包裹代码块。`;

const SPEC_OUTPUT_FORMAT = `# 规约: {从需求文档提炼的标题}

**任务 ID**: T-{date}-{slug}
**状态**: 草稿
**来源**: 需求文档梳理

## 1. 背景与动机

{用户要解决的问题、目标用户、业务/技术背景；未知则标注“待确认”}

## 2. 需求清单

### 功能需求
- [ ] FR-1: {可执行的功能需求}

### 非功能需求
- [ ] NFR-1: {性能/安全/兼容性/可维护性约束}

## 3. 范围界定

### 包含
- {本次明确包含的范围}

### 不包含
- {本次明确不做的范围}

### 待确认
- {原文缺失、冲突或需要用户确认的信息}

## 4. 关键决策

| # | 决策 | 选项 | 建议/结论 | 理由 |
|---|------|------|-----------|------|
| 1 | {待决策点} | {可选方案} | {建议或待确认} | {依据} |

## 4.1 重大变更门禁

### 是否涉及重大变更
- [ ] 否
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

### Decision Brief
- 当前问题:
- 目标:
- 背景:
- 可选方案:
- 推荐方案:
- 不做什么:
- 成本:
- 风险:
- 回滚方案:
- 用户确认:

## 5. 验收标准

- [ ] AC-1: {可验证的验收条件}

## 6. 风险与依赖

- {外部依赖、实现风险、迁移风险、测试风险}

## 7. 后续工作流

- 运行 \`docpath write-spec --stdin\` 写入本 spec
- 运行 \`docpath plan\` 生成执行计划
- 运行 \`docpath continue\` 恢复/推进工作流`;

async function ensureDocpathWorkspace(cwd: string): Promise<void> {
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }
}

function ensureRequirementDoc(requirementDoc: string): void {
  if (!requirementDoc.trim()) {
    console.error('❌  未提供需求文档。用法：');
    console.error('   docpath refine --file requirements.md');
    console.error('   cat requirements.md | docpath refine --stdin');
    console.error('   docpath refine --content "..."');
    process.exit(1);
  }
}

function printRequirementDryRun(requirementDoc: string): void {
  console.log('📝  [dry-run] 需求文档预览：');
  console.log(requirementDoc.slice(0, 1200));
  if (requirementDoc.length > 1200) console.log(`\n... (${requirementDoc.length - 1200} chars truncated)`);
}

async function emitRefinePrompt(cwd: string, requirementDoc: string): Promise<void> {
  const existingSpec = await readTaskFile(cwd, 'tasks/current/spec.md');

  emitPrompt({
    task: 'refine-requirements',
    system: REFINE_SYSTEM_PROMPT,
    context: {
      '原始需求文档': requirementDoc,
      '现有 spec.md': existingSpec
        ? `已有 spec.md（请合并、修正并保留有价值内容）：\n${existingSpec}`
        : '当前没有 spec.md，请从需求文档生成新的标准 spec。',
    },
    instructions: [
      '请把“原始需求文档”梳理为 DocPath 标准 spec.md；若存在 predev_analysis，必须吸收其中的需求、产品、UI/UX、技术、风险与开放问题分区。',
      '先提取事实、目标、约束、范围和验收标准，再整理为指定 Markdown 结构。',
      '不要编造原文没有的信息；缺失内容写入“待确认”。',
      '如果已有 spec.md，请合并已有内容并指出修正点。',
      '生成结果后，使用 `docpath write-spec --stdin` 写入 .docpath/tasks/current/spec.md。',
      '写入后运行 `docpath plan` 继续生成执行计划；必要时运行 `docpath continue` 恢复上下文。',
    ],
    output_format: SPEC_OUTPUT_FORMAT,
  });
}

export async function refineCommand(options: RefineOptions): Promise<void> {
  const { cwd } = options;
  await ensureDocpathWorkspace(cwd);

  const requirementDoc = await readRequirementInput(options);
  ensureRequirementDoc(requirementDoc);

  if (options.dryRun) {
    printRequirementDryRun(requirementDoc);
    return;
  }

  await emitRefinePrompt(cwd, requirementDoc);

  await transitionWorkflow(cwd, 'task.created', { currentStep: '需求梳理中，整理后写入 spec' });
  console.log('\n✅ 状态已更新为 drafting (requirements-refine)');
  await nextCommand({ cwd });
}

async function readRequirementInput(options: RefineOptions): Promise<string> {
  if (options.content) return options.content;

  if (options.file) {
    return readRequirementFile(options.cwd, options.file);
  }

  if (options.stdin !== false) {
    return readStdin();
  }

  return '';
}

function readStdin(): Promise<string> {
  return new Promise((resolveInput) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolveInput(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolveInput(''));
    if (process.stdin.isTTY) {
      resolveInput('');
    }
  });
}
