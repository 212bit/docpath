/**
 * docpath:budget — 上下文 Token 预算透视与剪枝建议
 *
 * 分析各上下文源（Rules / Active Task / Governance / Events / Views / Docs）
 * 的 Token 占比、行数与体积分布，提供超标警示与精准剪枝建议。
 */

import { existsSync } from 'node:fs';
import { resolveDocpathDir } from '../utils/file.js';
import {
  collectContextBudget,
  renderBudgetTable,
  type BudgetReport,
} from '../utils/budget.js';
import { gcDecisions } from '../governance/decisions.js';
import {
  planWorkspaceCleanup,
  cleanupWorkspace,
} from '../utils/workspace-cleanup.js';

export interface BudgetOptions {
  cwd: string;
  agent?: boolean;
  json?: boolean;
  suggest?: boolean;
  prune?: boolean;
  dryRun?: boolean;
}

export async function budgetCommand(options: BudgetOptions): Promise<void> {
  const { cwd, agent = false, json = false, suggest = false, prune = false, dryRun = false } = options;
  const { stringify } = await import('yaml');
  const docpathDir = await resolveDocpathDir(cwd);

  if (!existsSync(docpathDir)) {
    console.error('❌  未找到 .docpath/ 目录。请先运行 `docpath init`');
    process.exit(1);
  }

  // 1. 如果指定了 --prune，先执行可安全瘦身的瞬态文件清理 (GC & Decisions rotation)
  if (prune) {
    if (dryRun) {
      const plan = await planWorkspaceCleanup(cwd);
      console.log('\n🧹  [dry-run] 上下文安全剪枝计划预览:');
      console.log(`    - 待清理项: ${plan.summary.length} 项`);
      console.log('    (使用 `docpath budget --prune` 执行实际清理)\n');
    } else {
      await cleanupWorkspace(cwd);
      try {
        await gcDecisions(cwd, { retentionDays: 14, maxSizeKb: 50, maxRecords: 500 });
      } catch {
        // 容错
      }
      if (!agent && !json) {
        console.log('✅  已完成工作区瞬态事件与历史决策安全剪枝！');
      }
    }
  }

  // 2. 收集预算数据
  const report: BudgetReport = await collectContextBudget(cwd);

  // 3. 结构化 JSON 模式
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 4. Agent 紧凑视图
  if (agent) {
    console.log(
      stringify({
        agent_view: 'budget_overview',
        status: report.overallStatus,
        total_tokens: report.totalTokens,
        total_lines: report.totalLines,
        active_task: report.activeTask,
        distribution: Object.fromEntries(
          Object.entries(report.categories).map(([k, v]) => [
            k,
            { tokens: v.totalTokens, share: `${v.percentage}%`, status: v.status },
          ]),
        ),
        top_consumers: report.topConsumers.map((c) => ({
          path: c.displayPath,
          tokens: c.tokens,
          lines: c.lines,
        })),
        suggestions: report.suggestions.map((s) => ({
          severity: s.severity,
          target: s.target,
          message: s.message,
          command: s.actionCommand,
        })),
      }),
    );
    return;
  }

  // 5. 仅建议模式 (--suggest)
  if (suggest) {
    if (report.suggestions.length === 0) {
      console.log('\n✨ 当前上下文极度紧凑健康，无优化建议。\n');
      return;
    }
    console.log(`\n💡  上下文剪枝建议 (${report.suggestions.length} 条):\n`);
    for (const sug of report.suggestions) {
      const tag = sug.severity === 'high' ? '🔴 [高优先]' : sug.severity === 'medium' ? '🟡 [建议]' : 'ℹ️ [提示]';
      console.log(`  ${tag} ${sug.target}`);
      console.log(`     原因: ${sug.message}`);
      if (sug.actionCommand) {
        console.log(`     快捷命令: \`${sug.actionCommand}\``);
      }
      console.log('');
    }
    return;
  }

  // 6. 默认终端富文本与可视化进度条
  const table = renderBudgetTable(report);
  console.log(table);
}
