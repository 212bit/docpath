/**
 * docpath:plan — 根据 spec.md 生成执行计划
 *
 * 输出结构化 prompt，由宿主 Agent 将需求分解为子任务列表，写入 plan.md。
 *
 * Level 2+ 自动写入 checkpoint + breadcrumb。
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { resolveDocpathDir } from '../utils/file.js';
import { listValidWorkflowEvents, preferredWorkflowCommand, transitionWorkflow } from '../engine/transitions.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';
import { readCurrentState } from '../utils/workspace.js';
import { readActiveAnalysisSummary, writeActiveTaskFile } from '../utils/task-files.js';
import { assertMajorChangeGateReady } from '../utils/major-change.js';
import { readDocPathConfig } from '../utils/config.js';
import { emitNextHint } from '../utils/next-hint.js';
import { readBacklogItem } from '../engine/backlog.js';

interface PlanOptions {
  cwd: string;
  dryRun?: boolean;
}

interface PlanContext {
  docpathDir: string;
  spec: string;
  analysis: string;
  backlogEvidence: BacklogEvidenceContext | null;
}

interface BacklogEvidenceContext {
  backlogId: string;
  brainstorm: string | null;
  analysis: string | null;
  decisionBrief: string | null;
}

interface SpecCoverageIds {
  functionalRequirements: string[];
  acceptanceCriteria: string[];
}

interface PlanCoverageResult {
  ok: boolean;
  missingFunctionalRequirements: string[];
  missingAcceptanceCriteria: string[];
}

const PLAN_SYSTEM_PROMPT = `你是一个项目计划专家。根据用户提供的 spec.md，将需求分解为可执行的子任务。

规则：
1. 每个子任务必须可独立验收（有明确的 Done 条件）
2. 子任务之间有明确的依赖关系
3. 任务粒度适中：单个任务 10-15 分钟可完成（默认）
   - 简单任务（修改单个函数、添加配置项）：5-10 分钟
   - 中等任务（实现一个模块函数、添加一个命令选项）：10-15 分钟
   - 复杂任务（重构多文件、设计新架构）：可拆分为多个 10-15 分钟子步骤
4. 优先处理基础设施和接口定义，再处理实现细节
5. 步骤划分要具体：
   - ❌ 错误：S1: 实现功能 A（过于宽泛，可能需要 1 小时）
   - ✅ 正确：S1: 添加接口类型定义 → S2: 实现核心逻辑 → S3: 添加 CLI 选项 → S4: 更新文档

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

## Checklist
- [ ] S1
- [ ] S2
...

## 依赖关系图
S1 → S2 → S4
S1 → S3 → S5
\`\`\`
`;

function extractFirstMatch(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern);
  return match?.[1]?.trim() || null;
}

function extractChecklistEntries(content: string, prefix: string): Array<{ id: string; text: string }> {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^- \\[[ xX]\\] (${escaped}-\\d+):\\s*(.+)$`, 'gm');
  const entries: Array<{ id: string; text: string }> = [];
  for (const match of content.matchAll(pattern)) {
    const id = match[1]?.trim();
    const text = match[2]?.trim();
    if (id && text) entries.push({ id, text });
  }
  return entries;
}

export function extractSpecCoverageIds(spec: string): SpecCoverageIds {
  return {
    functionalRequirements: extractChecklistEntries(spec, 'FR').map((entry) => entry.id),
    acceptanceCriteria: extractChecklistEntries(spec, 'AC').map((entry) => entry.id),
  };
}

export function validateGeneratedPlanCoverage(spec: string, plan: string): PlanCoverageResult {
  const ids = extractSpecCoverageIds(spec);
  const containsId = (id: string) => new RegExp(`(^|[^A-Za-z0-9-])${id}([^A-Za-z0-9-]|$)`).test(plan);
  const missingFunctionalRequirements = ids.functionalRequirements.filter((id) => !containsId(id));
  const missingAcceptanceCriteria = ids.acceptanceCriteria.filter((id) => !containsId(id));
  return {
    ok: missingFunctionalRequirements.length === 0 && missingAcceptanceCriteria.length === 0,
    missingFunctionalRequirements,
    missingAcceptanceCriteria,
  };
}

function assertGeneratedPlanCoverage(spec: string, plan: string): void {
  const coverage = validateGeneratedPlanCoverage(spec, plan);
  if (coverage.ok) return;

  const lines = [
    'docpath plan: generated plan coverage check failed',
    'The generated plan is incomplete and was not written.',
  ];
  if (coverage.missingFunctionalRequirements.length > 0) {
    lines.push(`missing functional requirements: ${coverage.missingFunctionalRequirements.join(', ')}`);
  }
  if (coverage.missingAcceptanceCriteria.length > 0) {
    lines.push(`missing acceptance criteria: ${coverage.missingAcceptanceCriteria.join(', ')}`);
  }
  lines.push('Fix: write a complete plan that references every FR-* and AC-* id, then run `docpath write-plan --stdin`.');
  throw new Error(lines.join('\n'));
}

export function renderDraftPlan(spec: string, level = 2, agentFlow = false): string {
  const title = extractFirstMatch(spec, /^#\s+(.+)$/m) || '当前任务';
  const features = extractChecklistEntries(spec, 'FR');
  const acceptances = extractChecklistEntries(spec, 'AC');
  const primaryFeature = features[0]?.text || title.replace(/^T-\d{8}-[a-z0-9-]+\s+-\s+/, '');

  // R-306 比例刻度 + R-334：level ≤1 或 (agent_flow 且 level ≤2) 生成单步计划。
  // R-306 实测中三段式(梳理/实现/验证)对小任务是虚构仪式；agent_flow 把压缩推广到 level-2。
  if (level <= 1 || (agentFlow && level <= 2)) {
    const featureSummary = features.length > 0
      ? features.map((item) => `${item.id}: ${item.text}`).join('；')
      : primaryFeature;
    const acceptanceSummary = acceptances.length > 0
      ? acceptances.map((item) => `${item.id}: ${item.text}`).join('；')
      : 'plan.md 已生成并可进入执行';
    return [
      '## 执行计划',
      '',
      `### S1: 实现并验证 ${primaryFeature}`,
      `- **描述**: 完成 ${featureSummary}，随做随验（${level <= 1 ? 'level-1 压缩计划，R-306' : 'agent_flow 压缩计划，R-334'}）。`,
      `- **验收条件**: ${acceptanceSummary}`,
      '- **依赖**: 无',
      '',
      '## Checklist',
      '- [ ] S1',
      '',
      '## 依赖关系图',
      'S1',
      '',
    ].join('\n');
  }
  const primaryFeatureId = features[0]?.id;
  const primaryAcceptance = acceptances[0]
    ? `${acceptances[0].id}: ${acceptances[0].text}`
    : 'plan.md 已生成并可进入执行';
  const additionalFeatureSteps = features.slice(1).flatMap((feature, index) => {
    const stepNumber = index + 3;
    return [
      '',
      `### S${stepNumber}: 实现 ${feature.id} ${feature.text}`,
      `- **描述**: 在现有架构内完成 ${feature.id}: ${feature.text}。`,
      `- **验收条件**: ${feature.id} 已实现，并保持现有工作流兼容。`,
      `- **依赖**: S${stepNumber - 1}`,
    ];
  });
  const verificationStepNumber = Math.max(3, features.length + 2);
  const verificationDependency = `S${verificationStepNumber - 1}`;
  const acceptanceSummary = acceptances.length > 0
    ? acceptances.map((item) => `${item.id}: ${item.text}`).join('；')
    : primaryAcceptance;
  const checklistSteps = Array.from({ length: verificationStepNumber }, (_, index) => `- [ ] S${index + 1}`);

  return [
    '## 执行计划',
    '',
    `### S1: 梳理 ${primaryFeature}`,
    `- **描述**: 根据 spec 明确 ${primaryFeatureId ? `${primaryFeatureId}: ` : ''}${primaryFeature} 的实现边界和验收口径。`,
    `- **验收条件**: ${primaryAcceptance}`,
    '- **依赖**: 无',
    '',
    `### S2: 实现 ${primaryFeature}`,
    `- **描述**: 在现有架构内完成 ${primaryFeatureId ? `${primaryFeatureId}: ` : ''}${primaryFeature} 的代码与文档更新。`,
    `- **验收条件**: ${primaryFeatureId ? `${primaryFeatureId} ` : ''}${primaryFeature} 已实现，并保持现有工作流兼容。`,
    '- **依赖**: S1',
    ...additionalFeatureSteps,
    '',
    `### S${verificationStepNumber}: 验证验收标准`,
    `- **描述**: 验证 spec 中声明的验收标准：${acceptanceSummary}`,
    `- **验收条件**: ${acceptanceSummary}`,
    `- **依赖**: ${verificationDependency}`,
    '',
    '## Checklist',
    ...checklistSteps,
    '',
    '## 依赖关系图',
    checklistSteps.map((_, index) => `S${index + 1}`).join(' → '),
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
  const backlogEvidence = await loadBacklogEvidence(cwd, state?.backlog_id);
  return {
    docpathDir,
    spec: await readTaskFile(cwd, 'spec.md'),
    analysis: await readActiveAnalysisSummary(docpathDir, state?.task_id),
    backlogEvidence,
  };
}

/**
 * 从 backlog item 加载 evidence 字段，供 plan prompt 注入。
 * 如果 backlog_id 缺失或读取失败则返回 null。
 */
async function loadBacklogEvidence(cwd: string, backlogId: string | null | undefined): Promise<BacklogEvidenceContext | null> {
  if (!backlogId) return null;
  try {
    const item = await readBacklogItem(cwd, backlogId);
    if (!item) return null;
    const { brainstorm, analysis, decision_brief } = item.evidence;
    if (!brainstorm?.trim() && !analysis?.trim() && !decision_brief?.trim()) return null;
    return { backlogId, brainstorm, analysis, decisionBrief: decision_brief };
  } catch {
    return null;
  }
}

function printDryRun(spec: string): void {
  console.log('📝  [dry-run] Spec 内容预览：');
  console.log(spec.slice(0, 500));
  console.log('---');
}

function emitPlanPrompt(spec: string, analysis = '', backlogEvidence: BacklogEvidenceContext | null = null): void {
  const context: Record<string, string> = {
    'Spec.md 内容': spec,
  };
  if (analysis?.trim()) {
    context['predev_analysis'] = analysis;
  }
  if (backlogEvidence) {
    if (backlogEvidence.brainstorm?.trim()) {
      context['需求澄清历史 (brainstorm evidence)'] = backlogEvidence.brainstorm.trim();
    }
    if (backlogEvidence.analysis?.trim()) {
      context['深度分析摘要 (analysis evidence)'] = backlogEvidence.analysis.trim();
    }
    if (backlogEvidence.decisionBrief?.trim()) {
      context['已确认决策 (decision_brief)'] = backlogEvidence.decisionBrief.trim();
    }
  }

  emitPrompt({
    task: 'plan',
    system: PLAN_SYSTEM_PROMPT,
    context,
    instructions: [
      '请根据 spec.md 生成执行计划，写入 plan.md。',
      ...(backlogEvidence ? [
        '',
        '**注意**：本任务源自 backlog，上方已注入需求澄清历史和已确认决策。',
        '请基于这些已有上下文设计执行计划，无需重复澄清。',
      ] : []),
      '',
      '**执行方式**：',
      '1. 分析 spec 中的功能需求、约束和验收条件',
      '2. 分解为可独立验收的子任务（每个 10-15 分钟）',
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
      '## Checklist',
      '- [ ] S1',
      '- [ ] S2',
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
  const taskId = current?.task_id || 'current';
  const agentFlow = (await readDocPathConfig(cwd)).workflow?.agent_flow === true;
  const existingPlan = taskId === 'current'
    ? ''
    : await readCanonicalPlan(docpathDir, taskId);
  const planContent = existingPlan.trim() ? existingPlan : renderDraftPlan(spec || '', current?.level ?? 2, agentFlow);
  assertGeneratedPlanCoverage(spec, planContent);
  const { canonicalPath } = await writeActiveTaskFile(docpathDir, taskId, 'plan.md', planContent);
  return canonicalPath;
}

async function readCanonicalPlan(docpathDir: string, taskId: string): Promise<string> {
  const canonicalPlanPath = join(docpathDir, 'tasks', taskId, 'plan.md');
  if (!existsSync(canonicalPlanPath)) return '';
  return readFile(canonicalPlanPath, 'utf-8');
}

export async function planCommand(options: PlanOptions): Promise<void> {
  const { cwd } = options;
  const { docpathDir, spec, analysis, backlogEvidence } = await loadPlanContext(cwd);

  console.log('\n📋  生成执行计划...\n');

  if (options.dryRun) {
    printDryRun(spec);
    emitPlanPrompt(spec, analysis, backlogEvidence);
    return;
  }

  const current = await readCurrentState(cwd);

  // R-291: 写盘前先用 FSM 单源校验 plan.ready 合法性（fail-loud，零写入）。
  // 此前顺序是「先写 plan.md/plan.json 再转移」，completed 任务上误跑 plan 会先
  // 污染 canonical 计划证据才报非法转移（R-279 同族的半执行模式）。
  // transitionWorkflow 的持锁校验保留为最终防线，这里只是把校验提到写盘之前。
  if (current && !listValidWorkflowEvents(current).some((item) => item.event === 'plan.ready')) {
    throw new Error(
      `docpath plan: 当前 phase=${current.phase} 不允许生成计划（plan.ready 非法转移，已拒绝写盘）。\n` +
      `    建议下一步: ${preferredWorkflowCommand(current)}`,
    );
  }

  const agentFlow = (await readDocPathConfig(cwd)).workflow?.agent_flow === true;
  await assertMajorChangeGateReady(cwd, docpathDir, current?.task_id, 'plan', agentFlow);

  // 已有计划时同步 active alias；无计划时生成保守草案，避免 planning 状态缺 plan.md。
  const canonicalPath = await writeGeneratedPlan(cwd, docpathDir, spec);
  console.log(`✅  plan.md 已写入: ${canonicalPath}`);

  await transitionWorkflow(cwd, 'plan.ready', { currentStep: '计划已生成，下一步: docpath go' });
  console.log('\n✅ 状态已更新为 planning');
  console.log('💡 提示：本任务涉及架构决策吗？如果涉及，请记得在 spec.md 中记录完整的 Decision Brief。');
  await emitNextHint(cwd);
}
