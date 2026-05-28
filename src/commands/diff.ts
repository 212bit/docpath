/**
 * docpath:diff — 步骤间差异
 * git diff 或文件快照对比
 */

import { readFileSafe, resolveDocpathDir} from '../utils/file.js';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

interface DiffOptions {
  cwd: string;
  scope?: string;     // staged | last | step | all
  step?: string;      // step number for comparison
  noColor?: boolean;
}

export async function diffCommand(options: DiffOptions): Promise<void> {
  const scope = options.scope || 'staged';

  console.log(`\n🔍  变更差异 — scope: ${scope}\n`);

  const isGitRepo = existsSync(join(options.cwd, '.git'));

  if (!isGitRepo) {
    // Fallback: show .docpath file changes
    console.log('⚠️  非 Git 仓库，显示 .docpath 目录文件差异:\n');
    const workspaceDir = join(options.cwd, '.docpath', 'workspace');
    const current = await readFileSafe(join(workspaceDir, 'current.md'));
    const breadcrumb = await readFileSafe(join(workspaceDir, 'breadcrumb.md'));

    if (current) {
      console.log('── current.md ──');
      console.log(current.slice(0, 500));
    }
    if (breadcrumb) {
      console.log('\n── breadcrumb.md (最近) ──');
      const lines = breadcrumb.split('\n');
      console.log(lines.slice(-20).join('\n'));
    }
    console.log('');
    return;
  }

  try {
    let diffCmd = '';

    switch (scope) {
      case 'staged':
        diffCmd = 'git diff --cached --stat && echo "---DETAIL---" && git diff --cached';
        break;
      case 'last':
        diffCmd = 'git diff HEAD~1 --stat && echo "---DETAIL---" && git diff HEAD~1';
        break;
      case 'step':
        // Count checked items in plan to determine step
        const planPath = join(options.cwd, '.docpath', 'tasks', 'current', 'plan.md');
        const planContent = await readFileSafe(planPath);
        const doneCount = planContent?.match(/- \[x\]/g)?.length || 0;
        const n = options.step ? parseInt(options.step) : doneCount;
        diffCmd = `git diff HEAD~${n} --stat && echo "---DETAIL---" && git diff HEAD~${n}`;
        break;
      case 'all':
        diffCmd = 'git diff HEAD --stat && echo "---DETAIL---" && git diff HEAD';
        break;
      default:
        diffCmd = 'git diff --cached --stat';
    }

    const output = execSync(diffCmd, {
      cwd: options.cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });

    // Parse and format output
    const parts = output.split('---DETAIL---');
    const stats = parts[0]?.trim();
    const detail = parts[1]?.trim();

    if (!stats && !detail) {
      console.log('✅  无变更\n');
      return;
    }

    // Show stats
    if (stats) {
      console.log('📊  文件统计:');
      console.log(stats);
    }

    // Show detail (limited)
    if (detail) {
      const lines = detail.split('\n');
      const truncated = lines.length > 100
        ? [...lines.slice(0, 100), `\n... 省略 ${lines.length - 100} 行`]
        : lines;

      console.log('\n─── 变更详情 ───');
      console.log(truncated.join('\n'));
    }

    console.log('');
  } catch (err: any) {
    console.log(`⚠️  Git 执行失败: ${err.message}\n`);
  }
}
