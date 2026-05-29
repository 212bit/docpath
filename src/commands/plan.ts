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
import { updateCurrentState } from '../utils/workspace.js';
import { emitPrompt, readTaskFile } from '../utils/agent-prompt.js';

interface PlanOptions {
  cwd: string;
  dryRun?: boolean;
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

export async function planCommand(options: PlanOptions): Promise<void> {
  const { cwd } = options;
  const docpathDir = await resolveDocpathDir(cwd);
  const specPath = join(docpathDir, 'tasks', 'current', 'spec.md');
  const planPath = join(docpathDir, 'tasks', 'current', 'plan.md');

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath:init`');
    process.exit(1);
  }

  if (!existsSync(specPath)) {
    console.error('❌  未找到 spec.md。请先运行 `docpath:brainstorm` 生成规约。');
    process.exit(1);
  }

  console.log('\n📋  生成执行计划...\n');

  const spec = await readTaskFile(cwd, 'spec.md');

  if (options.dryRun) {
    console.log('📝  [dry-run] Spec 内容预览：');
    console.log(spec!.slice(0, 500));
    console.log('---');
    return;
  }

  // [Agent Mode] 输出结构化 prompt，由宿主 Agent 执行推理
  const prompt = emitPrompt('plan', {
    systemPrompt: PLAN_SYSTEM_PROMPT,
    context: `## Spec.md 内容\n\n${spec}`,
    instructions: `请根据 spec.md 生成执行计划，写入 plan.md。

**执行方式**：
1. 分析 spec 中的功能需求、约束和验收条件
2. 分解为可独立验收的子任务（每个 15-60 分钟）
3. 定义子任务间的依赖关系
4. 使用 \`docpath write-plan\` 写入结果

**plan.md 格式要求**：
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

## 依赖关系图
S1 → S2 → S4
S1 → S3 → S5
\`\`\``,
  });

  console.log(prompt);

  await updateCurrentState(cwd, 'drafting', { substep: 'agent-plan' });
  console.log('\n✅ 状态已更新为 drafting');
  console.log('📌 完成后运行: docpath write-plan\n');
}
