/**
 * docpath:status — 查看当前工作流状态
 */

import { join } from 'node:path';
import { generateAgentOutput } from '../utils/agent-output.js';
import { readFileSafe, resolveDocpathDir } from '../utils/file.js';
import { readCurrentState } from '../utils/workspace.js';

interface StatusOptions {
  cwd: string;
  agent?: boolean;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  const cwd = options.cwd;
  if (options.agent) {
    console.log(await generateAgentOutput(cwd));
    return;
  }

  const statePath = join(cwd, '.docpath/workspace/current.md');
  const breadcrumbPath = join(cwd, '.docpath/workspace/breadcrumb.md');

  const current = await readCurrentState(cwd);
  if (!current) {
    console.log('\n⚠️  未找到 .docpath/workspace/current.md');
    console.log('  请先运行 docpath:init 初始化工作流\n');
    return;
  }

  console.log('\n📊  DocPath 工作流状态\n');

  const level = String(current.level ?? '?');
  const state = current.state || '?';
  const task = current.task_title || '(无活跃任务)';

  const levelNames: Record<string, string> = {
    '0': '即时响应',
    '1': '轻量任务',
    '2': '标准任务',
    '3': '复杂任务',
  };

  console.log(`  级别:  Level ${level} — ${levelNames[level] || '未知'}`);
  console.log(`  状态:  ${state}`);
  console.log(`  任务:  ${task}`);
  console.log(`  文件:  ${statePath}`);

  const breadcrumb = await readFileSafe(breadcrumbPath);
  if (breadcrumb && breadcrumb.includes('## 当前会话')) {
    const phaseMatch = breadcrumb.match(/当前 Phase:\s*(\w+)/);
    const subTaskMatch = breadcrumb.match(/当前子任务:\s*(.+)/);
    if (phaseMatch || subTaskMatch) {
      console.log(`\n  🍞  执行进度:`);
      if (phaseMatch) console.log(`     Phase: ${phaseMatch[1]}`);
      if (subTaskMatch) console.log(`     子任务: ${subTaskMatch[1]}`);
    }
  }

  try {
    const docpathDir = await resolveDocpathDir(cwd);
    const infoRaw = await readFileSafe(join(docpathDir, 'docpath.json'));
    if (infoRaw) {
      const info = JSON.parse(infoRaw);
      if (info.linkedTo) {
        const target = join(cwd, info.linkedTo);
        console.log(`  🔗  已关联: ${info.linkedTo} (${target})`);
      }
    }
  } catch {
    // 无关联项目或关联信息不可读时忽略。
  }

  console.log('');
}
