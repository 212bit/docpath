/**
 * docpath backlog — show / get / view
 */

import { stringify } from 'yaml';
import { readBacklogItem } from '../../engine/backlog.js';
import type { BacklogCommandOptions } from './types.js';

export async function backlogShow(options: BacklogCommandOptions): Promise<void> {
  const targetId = (options.id || options.query || options.title)?.trim();
  if (!targetId) {
    throw new Error('docpath backlog show requires <id>');
  }

  const item = await readBacklogItem(options.cwd, targetId, { readArchived: true });
  if (!item) {
    throw new Error(`docpath backlog show: backlog 条目不存在: ${targetId}`);
  }

  if (options.json) {
    console.log(JSON.stringify(item, null, 2));
    return;
  }

  if (options.agent) {
    console.log(stringify({
      id: item.id,
      title: item.title,
      kind: item.kind || 'feature',
      priority: item.priority,
      level: item.level,
      status: item.status,
      readiness: item.readiness,
      is_archived: item.is_archived ?? false,
      file_path: item.file_path || null,
      created_at: item.created_at || null,
      links: {
        parent: item.links.parent || null,
        depends_on: item.links.depends_on || [],
        blocks: item.links.blocks || [],
        milestone: item.links.milestone || null,
        task: item.links.task || null,
      },
      evidence: item.evidence || {},
      body: item.body || '',
    }));
    return;
  }

  console.log(`\n📋  Backlog 条目详情: ${item.id}`);
  console.log(`   title:     ${item.title}`);
  const statusBadge = item.is_archived
    ? `${item.status} [已归档 / ${item.file_path || 'backlog/archived/'}]`
    : item.status;
  console.log(`   status:    ${statusBadge}`);
  console.log(`   readiness: ${item.readiness}`);
  console.log(`   kind:      ${item.kind || 'feature'}`);
  console.log(`   priority:  ${item.priority}`);
  console.log(`   level:     Level ${item.level}`);
  if (item.file_path) console.log(`   file:      ${item.file_path}`);
  if (item.created_at) console.log(`   created:   ${item.created_at}`);
  if (item.links.parent) console.log(`   parent:    ${item.links.parent}`);
  if (item.links.milestone) console.log(`   milestone: ${item.links.milestone}`);
  if (item.links.depends_on && item.links.depends_on.length > 0) {
    console.log(`   depends:   ${item.links.depends_on.join(', ')}`);
  }
  if (item.links.blocks && item.links.blocks.length > 0) {
    console.log(`   blocks:    ${item.links.blocks.join(', ')}`);
  }
  if (item.links.task) console.log(`   task:      ${item.links.task}`);

  if (item.body) {
    console.log('\n--- 正文内容 ---');
    console.log(item.body.trim());
    console.log('----------------\n');
  }
}
