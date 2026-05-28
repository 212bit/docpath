/**
 * docpath:plan — 根据 spec.md 生成执行计划
 *
 * 读取 .docpath/tasks/current/spec.md，通过 LLM 将需求分解为
 * 可独立验收的子任务列表，写入 .docpath/tasks/current/plan.md。
 *
 * Level 2+ 自动写入 checkpoint + breadcrumb。
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { updateCurrentState } from '../utils/workspace.js';
import { callLLM } from '../llm/client.js';

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
  const docpathDir = join(cwd, '.docpath');
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

  const spec = await readFile(specPath, 'utf-8');

  if (options.dryRun) {
    console.log('📝  [dry-run] Spec 内容预览：');
    console.log(spec.slice(0, 500));
    console.log('---');
    return;
  }

  const planResponse = await callLLM({
    system: PLAN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `请根据以下规约生成执行计划：\n\n${spec}` }],
  });

  const planContent = planResponse.content;

  await writeFile(planPath, planContent, 'utf-8');
  console.log(`✅  计划已写入 ${planPath}`);

  await updateCurrentState(cwd, 'planning_done');
  console.log('✅  状态已更新为 planning_done');
  console.log('\n✨  计划生成完成！下一步：执行第一个子任务，完成后运行 `docpath:continue`\n');
}
