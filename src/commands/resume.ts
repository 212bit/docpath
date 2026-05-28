/**
 * docpath:resume — 断线恢复
 * 读取 breadcrumb + current state → 跳到上次中断点
 */

import { readFileSafe, resolveDocpathDir} from '../utils/file.js';
import { join } from 'node:path';

interface ResumeOptions {
  cwd: string;
  verbose?: boolean;
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  const workspaceDir = join(options.cwd, '.docpath', 'workspace');

  // 1. 读取 current.md
  const currentPath = join(workspaceDir, 'current.md');
  const currentContent = await readFileSafe(currentPath);

  if (!currentContent) {
    console.log('\n⚠️  未找到活跃任务。运行 `docpath:init` 或 `docpath:brainstorm` 开始。\n');
    return;
  }

  // 2. 读取 breadcrumb
  const breadcrumbPath = join(workspaceDir, 'breadcrumb.md');
  const breadcrumbContent = await readFileSafe(breadcrumbPath);

  // 3. 读取 plan.md
  const planPath = join(options.cwd, '.docpath', 'tasks', 'current', 'plan.md');
  const planContent = await readFileSafe(planPath);

  // 4. 读取 config
  const configPath = join(options.cwd, '.docpath', 'config.yaml');
  const configContent = await readFileSafe(configPath);

  console.log('\n🔄  断线恢复 — DocPath Checkpoint\n');

  // Extract state info
  const levelMatch = currentContent.match(/level:\s*(\d)/);
  const stateMatch = currentContent.match(/state:\s*(\w+)/);
  const taskMatch = currentContent.match(/task_title:\s*"?([^"\n]+)"?/);

  const level = levelMatch ? levelMatch[1] : '?';
  const state = stateMatch ? stateMatch[1] : '?';
  const task = taskMatch ? taskMatch[1] : '(无标题)';

  console.log(`📋  任务: ${task}`);
  console.log(`📊  级别: Level ${level} | 状态: ${state}`);

  // Find current subtask from plan
  if (planContent) {
    const unchecked = planContent.match(/- \[ \].+/g);
    const checked = planContent.match(/- \[x\].+/g);
    const total = (unchecked?.length || 0) + (checked?.length || 0);
    const done = checked?.length || 0;

    if (unchecked && unchecked.length > 0) {
      const next = unchecked[0];
      console.log(`\n▶️  下一个子任务: ${next.replace('- [ ] ', '')}`);
      console.log(`📈  进度: ${done}/${total} 完成`);
    } else if (done > 0) {
      console.log(`\n✅  全部 ${total} 个子任务已完成！`);
      console.log(`💡  下一步: \`docpath:review\` → \`docpath:journal\``);
    }
  }

  // Breadcrumb context
  if (breadcrumbContent && options.verbose) {
    console.log('\n─── 面包屑上下文 ───');
    const recentLines = breadcrumbContent.split('\n').slice(-15);
    console.log(recentLines.join('\n'));
  }

  // LLM config status
  if (configContent) {
    const hasKey = configContent.includes('apiKey:') && !configContent.includes('apiKey: ""');
    console.log(`\n🤖  LLM: ${hasKey ? '已配置' : '未配置 (仅模板模式)'}`);
  }

  console.log(`\n💡  运行 \`docpath:go\` 继续执行\n`);
}
