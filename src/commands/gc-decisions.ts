/**
 * docpath:gc-decisions — 按月轮转历史决策日志。
 */

import { gcDecisions } from '../governance/decisions.js';

interface GcDecisionsCommandOptions {
  cwd: string;
  retentionDays?: string | number;
}

function normalizeRetentionDays(value: string | number | undefined): number {
  if (value === undefined || value === '') return 14;
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`docpath gc-decisions: --retention-days 非法: ${value}`);
  }
  return parsed;
}

export async function gcDecisionsCommand(options: GcDecisionsCommandOptions): Promise<void> {
  const retentionDays = normalizeRetentionDays(options.retentionDays);
  const result = await gcDecisions(options.cwd, { retentionDays });

  console.log('\n🧹  DocPath Decisions GC\n');
  console.log(`保留窗口: ${retentionDays} 天`);
  console.log(`主文件: ${result.decisionsPath}`);
  console.log(`保留条目: ${result.retained}`);
  console.log(`归档条目: ${result.archived}`);

  if (result.archiveFiles.length > 0) {
    console.log('归档文件:');
    for (const archiveFile of result.archiveFiles) {
      console.log(`- ${archiveFile}`);
    }
  } else {
    console.log('归档文件: 无新增');
  }
}
