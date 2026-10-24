/**
 * docpath backlog — import / export
 */

import { stringify } from 'yaml';
import { exportBacklogItems, importBacklogItems } from '../../engine/backlog-io.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogImport(options: BacklogCommandOptions): Promise<void> {
  const filePath = options.file || options.id;
  if (!filePath) {
    throw new Error('docpath backlog import requires <file_path>');
  }

  const result = await importBacklogItems(options.cwd, {
    filePath,
    dryRun: options.dryRun,
    overwrite: options.overwrite,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify(result));
    return;
  }

  console.log(`=== Backlog 批量导入${options.dryRun ? ' (预览模式 --dry-run)' : ''} ===\n`);
  console.log(`✅  成功创建: ${result.imported} 个 | 更新: ${result.updated} 个 | 跳过: ${result.skipped} 个 | 失败: ${result.errors.length} 个\n`);

  for (const it of result.items) {
    const badge = it.action === 'created' ? '➕ [新建]' : it.action === 'updated' ? '🔄 [更新]' : it.action === 'skipped' ? '⏭️  [跳过]' : '❌ [错误]';
    console.log(`  ${badge} ${it.id}: ${it.title}${it.error ? ` (${it.error})` : ''}`);
  }
}

export async function backlogExport(options: BacklogCommandOptions): Promise<void> {
  const result = await exportBacklogItems(options.cwd, {
    format: options.format,
    status: options.status,
    priority: options.priority,
    kind: options.kind,
    readyOnly: options.readyOnly || options.unblocked,
    outputPath: options.output,
  });

  if (result.outputPath) {
    console.log(`✅  已成功导出 ${result.count} 条 Backlog 到: ${result.outputPath}`);
  } else {
    console.log(result.content);
  }
}
