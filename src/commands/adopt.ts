/**
 * docpath adopt — 人机混合开发轻量认领快捷命令
 *
 * 场景 1：当前已有活跃任务（planning/executing 等）：
 *         自动将工作区未提交的代码/文件变动认领进当前步骤（等价于 docpath go --adopt）。
 * 场景 2：当前无活跃任务，且传入了任务标题（docpath adopt "标题"）：
 *         一键就地创建并拉起新任务且认领代码（等价于 docpath start "标题" --draft --adopt）。
 * 场景 3：当前无活跃任务且未传标题：
 *         检查并展示工作区未提交变更，引导用户运行 docpath adopt "<标题>" 或 docpath start "<标题>" --draft --adopt。
 */

import pc from 'picocolors';
import { readCurrentState } from '../utils/workspace.js';
import { goCommand } from './go.js';
import { startCommand } from './start.js';
import { detectUncommittedNonDocPathFiles } from '../utils/git-dirty-guard.js';

export interface AdoptOptions {
  cwd: string;
  title?: string;
  step?: string;
  session?: string;
}

export async function adoptCommand(options: AdoptOptions): Promise<void> {
  const { cwd, title, step, session } = options;
  const current = await readCurrentState(cwd);

  const hasActiveTask = Boolean(
    current?.task_id &&
    current.phase !== 'idle' &&
    current.phase !== 'completed'
  );

  if (hasActiveTask) {
    console.log(pc.cyan(`\n📦  检测到进行中的活跃任务 ${current!.task_id} (阶段: ${current!.phase})`));
    console.log(pc.gray(`   正在将工作区未提交代码变更认领至步骤执行...\n`));
    await goCommand({
      cwd,
      step,
      adopt: true,
      session,
    });
    return;
  }

  // 无活跃任务时，若传入了标题，直接拉起新任务并认领
  if (title?.trim()) {
    console.log(pc.cyan(`\n📦  正在就地认领代码并启动新任务: "${title.trim()}"...\n`));
    await startCommand({
      cwd,
      id: title.trim(),
      draft: true,
      adopt: true,
      session,
    });
    return;
  }

  // 无活跃任务且未传标题，检查工作区未提交文件
  const { nonDocPathFiles, count } = detectUncommittedNonDocPathFiles(cwd);
  if (count > 0) {
    const preview = nonDocPathFiles.slice(0, 8).map((f) => `  - ${f}`).join('\n');
    const more = count > 8 ? `\n  ... (+${count - 8} 个文件)` : '';
    throw new Error([
      `docpath adopt: 当前没有活跃任务，无法直接将变更认领至步骤。`,
      `检测到工作区存在 ${count} 个未提交代码变更:`,
      preview + more,
      '',
      `💡 解决方案:`,
      `  - 认领并创建新任务: docpath adopt "<任务标题>"`,
      `  - 标准流程启动:     docpath start "<任务标题>" --draft --adopt`,
      `  - 极简快速任务:     docpath quick "<任务标题>" --adopt`,
      `  - 暂存当前变更:     docpath task stash "WIP"`,
    ].join('\n'));
  }

  console.log(pc.green('✨ 当前工作区干净且无活跃任务，无需认领代码。'));
  console.log(pc.gray('   如需启动新任务，请运行: docpath start "<任务标题>" --draft\n'));
}
