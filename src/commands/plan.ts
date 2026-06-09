/**
 * docpath:plan — 根据 spec.md 生成执行计划
 *
 * 输出结构化 prompt，由宿主 Agent 将需求分解为子任务列表，写入 plan.md。
 *
 * Level 2+ 自动写入 checkpoint + breadcrumb。
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { transitionWorkflow } from '../engine/transitions.js';
import { nextCommand } from './runtime.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { readCurrentState } from '../utils/workspace.js';
import { readActiveAnalysisSummary, writeActiveTaskFile } from '../utils/task-files.js';

interface PlanOptions {
  cwd: string;
  dryRun?: boolean;
}

interface PlanContext {
  docpathDir: string;
  spec: string;
  analysis: string;
}

const PLAN_SYSTEM_PROMPT = `你是一个项目计划专家。根据用户提供的 spec.md，将需求分解为可执行的子任务。

规则：
1. 每个子任务必须可独立验收（有明确的 Done 条件）
2. 子任务之间有明确的依赖关系
3. 任务粒度适中：单个任务 15-60 分钟可完成
4. 优先处理基础设施和接口定义，再处理实现细节

输出格式（纯 Markdown + checklist）：
\`\`\`markdown
## 执行计划

### S1: [子任务名]
- **描述**: xxx
- **验收条件**: xxx
- **依赖**: 无

### S2: [子任务名]
- **描述**: xxx
- **验收条件**: xxx
- **依赖**: S1

...（继续直到所有需求被覆盖）

## 依赖关系图
S1 → S2 → S4
S1 → S3 → S5
\`\`\`
`;

function extractFirstMatch(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern);
  return match?.[1]?.trim() || null;
}

function extractChecklistItems(content: string, prefix: string): string[] {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^- \\[[ xX]\\] (${escaped}-\\d+):\\s*(.+)$`, 'gm');
  const items: string[] = [];
  for (const match of content.matchAll(pattern)) {
    const text = match[2]?.trim();
    if (text) items.push(text);
  }
  return items;
}

function renderDraftPlan(spec: string): string {
  const title = extractFirstMatch(spec, /^#\s+(.+)$/m) || '当前任务';
  const features = extractChecklistItems(spec, 'FR');
  const acceptances = extractChecklistItems(spec, 'AC');
  const primaryFeature = features[0] || title.replace(/^T-\d{8}-[a-z0-9-]+\s+-\s+/, '');
  const primaryAcceptance = acceptances[0] || 'plan.md 已生成并可进入执行';

  return [
    '## 执行计划',
    '',
    `### S1: 梳理 ${primaryFeature}`,
    `- **描述**: 根据 spec 明确 ${primaryFeature} 的实现边界和验收口径。`,
    `- **验收条件**: ${primaryAcceptance}`,
    '- **依赖**: 无',
    '',
    `### S2: 实现 ${primaryFeature}`,
    `- **描述**: 在现有架构内完成 ${primaryFeature} 的代码与文档更新。`,
    `- **验收条件**: ${primaryFeature} 已实现，并保持现有工作流兼容。`,
    '- **依赖**: S1',
    '',
    '### S3: 验证门禁并归档',
    '- **描述**: 运行相关测试、docpath check/review/journal，完成任务归档。',
    '- **验收条件**: 质量门禁通过，任务状态进入 completed。',
    '- **依赖**: S2',
    '',
    '## 依赖关系图',
    'S1 → S2 → S3',
    '',
  ].join('\n');
}

async function loadPlanContext(cwd: string): Promise<PlanContext> {
  const docpathDir = await resolveDocpathDir(cwd);
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (!existsSync(specPath)) {
    console.error('❌  未找到 spec.md。请先运行 `docpath:brainstorm` 生成规约。');
    process.exit(1);
  }

  const state = await readCurrentState(docpathDir);
  return {
    docpathDir,
    spec: await readTaskFile(cwd, 'spec.md'),
    analysis: await readActiveAnalysisSummary(docpathDir, state?.task_id),
  };
}

function printDryRun(spec: string, analysis = ''): void {
  console.log('📝  [dry-run] Spec 内容预览：');
  console.log(spec.slice(0, 500));
  console.log('---');
}

function emitPlanPrompt(spec: string, analysis = ''): void {
  emitPrompt({
    task: 'plan',
    system: PLAN_SYSTEM_PROMPT,
    context: {
      'Spec.md 内容': spec,
      ...(analysis.trim() ? { predev_analysis: analysis } : {}),
    },
    instructions: [
      '请根据 spec.md 生成执行计划，写入 plan.md。',
      '',
      '**执行方式**：',
      '1. 分析 spec 中的功能需求、约束和验收条件',
      '2. 分解为可独立验收的子任务（每个 15-60 分钟）',
      '3. 定义子任务间的依赖关系',
      '4. 使用 `docpath write-plan` 写入结果',
      '',
      '**plan.md 格式要求**：',
      '```markdown',
      '## 执行计划',
      '',
      '### S1: [子任务名]',
      '- **描述**: xxx',
      '- **验收条件**: xxx',
      '- **依赖**: 无',
      '',
      '### S2: [子任务名]',
      '- **描述**: xxx',
      '- **验收条件**: xxx',
      '- **依赖**: S1',
      '',
      '## 依赖关系图',
      'S1 → S2 → S4',
      'S1 → S3 → S5',
      '```',
    ],
    output_format: 'plan.md (markdown)',
  });
}

async function writeGeneratedPlan(cwd: string, docpathDir: string, spec: string): Promise<string> {
  const current = await readCurrentState(cwd);
  const existingPlan = await readTaskFile(cwd, 'plan.md');
  const planContent = existingPlan.trim() ? existingPlan : renderDraftPlan(spec || '');
  const taskId = current?.task_id || 'current';
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'plan.md', planContent);
  return canonicalPath;
}

export async function planCommand(options: PlanOptions): Promise<void> {
  const { cwd } = options;
  const { docpathDir, spec, analysis } = await loadPlanContext(cwd);

  console.log('\n📋  生成执行计划...\n');

  if (options.dryRun) {
    printDryRun(spec, analysis);
    return;
  }

  emitPlanPrompt(spec, analysis);

  // 已有计划时同步 active alias；无计划时生成保守草案，避免 planning 状态缺 plan.md。
  const canonicalPath = await writeGeneratedPlan(cwd, docpathDir, spec);
  console.log(`✅  plan.md 已写入: ${canonicalPath}`);

  await transitionWorkflow(cwd, 'plan.ready', { currentStep: '计划已生成，下一步: docpath go' });
  console.log('\n✅ 状态已更新为 planning');
  await nextCommand({ cwd });
}
